import { useState, useCallback, useRef } from 'react';
import type {
    ProcessingState,
    SessionTokenStats,
    TokenUsage,
    Subtitle,
    MediaFile,
    AppSettings,
    SubtitleVersion,
    ScreenSize,
    AudioChunk,
    SilenceSegment,
    AIProvider,
} from '../types';
import { createAudioChunks } from '../services/audioProcessor';
import {
    transcribeChunk,
    mergeSubtitles,
    enforceSubtitleQuality,
    generateSrt,
    generateWebVtt,
    generateAss,
    translateSubtitles
} from '../services/transcriber';
import { layoutSubtitles } from '../services/subtitleLayout';
import { healSubtitles } from '../services/healer';
import { parseSubtitleFile } from '../services/subtitleParser';
import { callTextProvider, providerNeedsApiKey } from '../services/providers';
import { generateId, formatDisplayTime } from '../utils';
import { logSession } from '../services/sessionLog';

const DONE_STATUS_DELAY_MS = 2000;

// Retry config: each chunk gets MAX_RETRIES attempts with exponential backoff.
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1500;

// Maps a video's pixel aspect ratio to the nearest subtitle preset.
function inferEffectiveScreenSize(width: number, height: number): 'wide' | 'square' | 'vertical' {
    const ratio = width / height;
    if (ratio >= 1.5) return 'wide';
    if (ratio >= 0.75) return 'square';
    return 'vertical';
}

// Returns target render dimensions for a given screen size.
function getRenderTarget(screenSize: string): { width: number; height: number } | null {
    switch (screenSize) {
        case 'wide':     return { width: 1920, height: 1080 };
        case 'square':   return { width: 1080, height: 1080 };
        case 'vertical': return { width: 1080, height: 1920 };
        default:         return null;
    }
}

// State saved when the user pauses, enabling resume later.
interface ChunkCheckpoint {
    chunks: AudioChunk[];
    silences: SilenceSegment[];
    processAudioPath: string;
    chunkResults: (Subtitle[] | null)[];
    nextChunkIndex: number;
    effectiveScreenSize: 'wide' | 'square' | 'vertical';
}

interface UseTranscriptionPipelineProps {
    settings: AppSettings;
    mediaFile: MediaFile | null;
    subtitles: Subtitle[];
    versions: SubtitleVersion[];
    activeVersionId: string | null;
    setSubtitles: (subs: Subtitle[]) => void;
    /** Like setSubtitles but does NOT add to undo history — used for live chunk previews */
    resetSubtitles: (subs: Subtitle[]) => void;
    addVersion: (v: SubtitleVersion) => void;
    projectDir: string | null;
    onProjectTouched: () => void;
    setShowGenerator: (show: boolean) => void;
}

export function useTranscriptionPipeline({
    settings,
    mediaFile,
    subtitles,
    versions,
    activeVersionId,
    setSubtitles,
    resetSubtitles,
    addVersion,
    projectDir,
    onProjectTouched,
    setShowGenerator
}: UseTranscriptionPipelineProps) {
    const transcriptionConcurrency = settings.activeProvider === 'local' ? 1 : 3;

    const [processing, setProcessing] = useState<ProcessingState>({ status: 'idle', progress: 0 });
    const [showTranslator, setShowTranslator] = useState(false);
    const [translateTargetLang, setTranslateTargetLang] = useState('Spanish');
    const [exportFormat, setExportFormat] = useState<'srt' | 'vtt' | 'ass'>('srt');
    const [renderResolution, setRenderResolution] = useState<ScreenSize>('original');
    const [tokenStats, setTokenStats] = useState<SessionTokenStats>({
        totalInputTokens: 0,
        totalOutputTokens: 0,
        calls: [],
    });

    // Control flags — use refs so async pipeline functions always see the latest value
    const stopRequestedRef = useRef(false);
    const pauseRequestedRef = useRef(false);
    const skipHealingRef = useRef(false);
    const translateAbortRef = useRef<AbortController | null>(null);
    const checkpointRef = useRef<ChunkCheckpoint | null>(null);
    // Becomes true only once the checkpoint is fully saved (safe to call handleResume)
    const [checkpointReady, setCheckpointReady] = useState(false);
    // Becomes true immediately when user clicks Pause; cleared once status becomes 'paused'
    const [isPausing, setIsPausing] = useState(false);

    const addTokenUsage = useCallback((usage: TokenUsage) => {
        setTokenStats(prev => ({
            totalInputTokens: prev.totalInputTokens + usage.inputTokens,
            totalOutputTokens: prev.totalOutputTokens + usage.outputTokens,
            calls: [...prev.calls, usage],
        }));
    }, []);

    // ─────────────────────── low-level helpers ───────────────────────

    // Transcribe one chunk with automatic retries and exponential backoff.
    async function transcribeWithRetry(
        chunk: AudioChunk,
        provider: AIProvider,
        apiKey: string,
        model: string,
        language: string,
        autoDetect: boolean,
        screenSize: 'wide' | 'square' | 'vertical',
    ) {
        let lastErr: Error = new Error('Unknown error');
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                // previousTranscript is omitted in parallel mode; audio overlap handles continuity.
                return await transcribeChunk(
                    chunk, provider, apiKey, model,
                    language, autoDetect, 'standard', '', screenSize
                );
            } catch (err) {
                lastErr = err instanceof Error ? err : new Error(String(err));
                console.error(
                    `[Chunk ${chunk.index + 1}] Attempt ${attempt}/${MAX_RETRIES} failed: ${lastErr.message}`
                );
                logSession('pipeline.chunk.retry', {
                    chunk: chunk.index + 1,
                    attempt,
                    maxAttempts: MAX_RETRIES,
                    start: chunk.start,
                    end: chunk.end,
                    error: lastErr.message,
                }, 'warn');
                if (attempt < MAX_RETRIES) {
                    const delay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
                    console.log(`[Chunk ${chunk.index + 1}] Retrying in ${delay}ms…`);
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }
        throw lastErr;
    }

    // Process chunks in parallel up to transcriptionConcurrency at a time.
    // Respects stop/pause flags — workers stop picking up new chunks when flagged.
    // Returns the processing outcome and the next unstarted chunk index (for resume).
    async function processParallel(
        chunks: AudioChunk[],
        startFrom: number,
        chunkResults: (Subtitle[] | null)[],
        provider: AIProvider,
        apiKey: string,
        model: string,
        language: string,
        autoDetect: boolean,
        screenSize: 'wide' | 'square' | 'vertical',
        addUsage: (u: TokenUsage) => void,
        onChunkDone?: (results: (Subtitle[] | null)[]) => void,
    ): Promise<{ outcome: 'completed' | 'paused' | 'stopped' | 'error'; nextIndex: number; error?: Error }> {
        // nextIndex is shared across workers (safe because JS is single-threaded for the increment op)
        let nextIndex = startFrom;
        let outcome: 'completed' | 'paused' | 'stopped' | 'error' = 'completed';
        let fatalError: Error | undefined;

        const getCompletedCount = () => chunkResults.filter(Boolean).length;
        const totalChunks = chunks.length;

        const runWorker = async () => {
            while (true) {
                if (stopRequestedRef.current)  { outcome = 'stopped'; return; }
                if (pauseRequestedRef.current) { outcome = 'paused';  return; }

                const i = nextIndex++;
                if (i >= chunks.length) return; // no more work for this worker

                try {
                    const result = await transcribeWithRetry(
                        chunks[i], provider, apiKey, model, language, autoDetect, screenSize
                    );
                    chunkResults[i] = result.subtitles;
                    addUsage(result.tokenUsage);
                    onChunkDone?.(chunkResults);

                    const done = getCompletedCount();
                    setProcessing({
                        status: 'transcribing',
                        progress: 30 + (done / totalChunks) * 60,
                        currentChunk: done,
                        totalChunks,
                    });
                } catch (err) {
                    if (!fatalError) {
                        fatalError = err instanceof Error ? err : new Error(String(err));
                        outcome = 'error';
                        console.error(
                            `[Chunk ${chunks[i].index + 1}] Permanently failed after ${MAX_RETRIES} retries:`,
                            fatalError.message
                        );
                    }
                    return; // stop this worker; others will also see outcome='error' and exit
                }
            }
        };

        const concurrency = Math.min(transcriptionConcurrency, Math.max(1, chunks.length - startFrom));
        await Promise.all(Array.from({ length: concurrency }, runWorker));

        return { outcome, nextIndex, error: fatalError };
    }

    // ─────────────────────── finalization ───────────────────────

    // Merge, heal, quality-enforce, and save the completed subtitle set.
    async function finalizeSubtitles(
        chunkResults: (Subtitle[] | null)[],
        processAudioPath: string,
        silences: SilenceSegment[],
        provider: AIProvider,
        apiKey: string,
        model: string,
        screenSize: 'wide' | 'square' | 'vertical',
        currentSettings: AppSettings,
        currentVersionsCount: number,
        _currentMediaFile: MediaFile | null,
    ) {
        setProcessing({ status: 'merging', progress: 90 });
        let merged = mergeSubtitles(chunkResults.filter(Boolean) as Subtitle[][]);

        // Reset skip flag before starting healing
        skipHealingRef.current = false;
        setProcessing({ status: 'healing', progress: 95 });

        let healingFailed = false;
        try {
            const healResult = await healSubtitles(
                merged, processAudioPath, silences,
                provider, apiKey, model,
                currentSettings.language, currentSettings.autoDetectLanguage, screenSize,
                // Skip signal: checked before each gap
                () => skipHealingRef.current,
                // Progress: maps gap progress to 95-99%
                (completed, total) => {
                    setProcessing({
                        status: 'healing',
                        progress: 95 + (completed / total) * 4,
                        currentChunk: completed,
                        totalChunks: total,
                    });
                },
            );
            merged = healResult.subtitles;
            healResult.tokenUsages.forEach(addTokenUsage);
            logSession('pipeline.heal.done', { cues: merged.length, usages: healResult.tokenUsages.length });
        } catch (err) {
            console.error('[Healing] Healing step failed:', err);
            healingFailed = true;
            logSession('pipeline.heal.error', {
                message: err instanceof Error ? err.message : String(err),
            }, 'error');
        }

        merged = enforceSubtitleQuality(merged, renderResolution);

        let finalLanguage = currentSettings.language;
        if (currentSettings.autoDetectLanguage && merged.length > 0) {
            try {
                const sampleText = merged.slice(0, 10).map(s => s.text).join(' ');
                const prompt = `What language is this text? Reply with ONLY the exact English name of the language (e.g., 'Spanish', 'French', 'Hebrew', 'English'). TEXT: ${sampleText}`;
                const translator = currentSettings.translator;
                const langResponse = await callTextProvider(
                    translator.provider,
                    currentSettings.providers[translator.provider].apiKey,
                    translator.model,
                    prompt,
                );
                addTokenUsage(langResponse.tokenUsage);
                const cleanLang = langResponse.text.trim().replace(/[^a-zA-Z]/g, '');
                if (cleanLang.length > 0 && cleanLang.length < 20) finalLanguage = cleanLang;
            } catch (err) {
                console.warn('[Language detect] Failed to detect language:', err);
            }
        }

        const activeConfig = currentSettings.providers[provider];
        const isAuto = currentSettings.autoDetectLanguage;
        const versionNumber = currentVersionsCount + 1;
        const displaySourceLang = isAuto ? finalLanguage : currentSettings.language;
        const labelStr = isAuto
            ? `V${versionNumber}-${displaySourceLang}_Auto, ${activeConfig.model}`
            : `V${versionNumber}-${displaySourceLang}, ${activeConfig.model}`;

        const versionId = generateId();
        const newVersion: SubtitleVersion = {
            id: versionId,
            timestamp: Date.now(),
            provider,
            model,
            language: finalLanguage,
            subtitles: merged,
            label: labelStr,
        };

        addVersion(newVersion);
        setSubtitles(merged);
        setProcessing({
            status: 'done',
            progress: 100,
            warning: healingFailed ? 'Could not fill some gaps — quality may be lower.' : undefined,
        });
        setShowGenerator(false);

        if (projectDir && window.electronAPI) {
            onProjectTouched();
            window.electronAPI.saveProject({
                projectDir,
                subtitles: merged,
            }).catch(() => { });
        }

        setTimeout(() => {
            setProcessing({ status: 'idle', progress: 0 });
        }, healingFailed ? 6000 : DONE_STATUS_DELAY_MS);
    }

    // Save whatever chunks completed so far as a partial version (called on error).
    async function savePartialResults(
        chunkResults: (Subtitle[] | null)[],
        screenSize: 'wide' | 'square' | 'vertical',
        provider: string,
        model: string,
        currentSettings: AppSettings,
        currentVersionsCount: number,
        _currentMediaFile: MediaFile | null,
    ) {
        const valid = chunkResults.filter(Boolean) as Subtitle[][];
        if (valid.length === 0) return;

        let merged = mergeSubtitles(valid);
        merged = enforceSubtitleQuality(merged, renderResolution);

        const versionNumber = currentVersionsCount + 1;
        const labelStr = `V${versionNumber}-Partial (${valid.length}/${chunkResults.length} chunks), ${model}`;

        addVersion({
            id: generateId(),
            timestamp: Date.now(),
            provider,
            model,
            language: currentSettings.language,
            subtitles: merged,
            label: labelStr,
        });
        setSubtitles(merged);

        if (projectDir) {
            onProjectTouched();
        }

        console.log(`[Error recovery] Saved ${valid.length}/${chunkResults.length} chunks as partial version "${labelStr}"`);
    }

    // ─────────────────────── main pipeline ───────────────────────

    const handleGenerate = useCallback(async () => {
        const activeConfig = settings.providers[settings.activeProvider];
        if (!mediaFile) return;
        if (providerNeedsApiKey(settings.activeProvider) && !activeConfig.apiKey) return;

        // Reset abort flags
        stopRequestedRef.current = false;
        pauseRequestedRef.current = false;
        checkpointRef.current = null;
        setCheckpointReady(false);

        const { apiKey, model } = activeConfig;
        const provider = settings.activeProvider;
        logSession('pipeline.generate.start', {
            provider,
            model,
            language: settings.language,
            autoDetect: settings.autoDetectLanguage,
            media: {
                path: mediaFile.path,
                duration: mediaFile.duration,
                size: mediaFile.size,
                isVideo: mediaFile.isVideo,
            },
        });

        try {
            if (!window.electronAPI) throw new Error('Electron API not found');

            const tempDir = await window.electronAPI.getTempPath();
            const audioFormat = 'mp3';

            setProcessing({ status: 'extracting', progress: 1 });
            const audioOutput = `${tempDir}/subtitles_gen_audio_${Date.now()}.${audioFormat}`;

            const unsubExtract = window.electronAPI.onExtractAudioProgress(({ percent }) => {
                if (!stopRequestedRef.current) {
                    setProcessing({ status: 'extracting', progress: 1 + Math.round(percent * 0.14) });
                }
            });

            try {
                await window.electronAPI.extractAudio(mediaFile.path, audioOutput, audioFormat);
            } catch (err) {
                console.error('[Extract] Audio extraction error:', err);
                throw new Error(`Audio extraction failed: ${err instanceof Error ? err.message : String(err)}`);
            } finally {
                unsubExtract();
            }
            const processAudioPath = audioOutput;

            if (stopRequestedRef.current) {
                window.electronAPI.cleanupTempAudio().catch(() => { });
                setProcessing({ status: 'idle', progress: 0 });
                return;
            }

            setProcessing({ status: 'detecting-silences', progress: 15 });
            const { chunks, silences } = await createAudioChunks(processAudioPath, tempDir, audioFormat, provider);
            console.log(`[Transcription] ${chunks.length} chunks detected, concurrency=${transcriptionConcurrency}`);
            logSession('pipeline.chunks', {
                count: chunks.length,
                silences: silences.length,
                concurrency: transcriptionConcurrency,
                chunks: chunks.map(c => ({ index: c.index, start: c.start, end: c.end })),
            });

            const effectiveScreenSize = settings.screenSize === 'original' && mediaFile.width && mediaFile.height
                ? inferEffectiveScreenSize(mediaFile.width, mediaFile.height)
                : (settings.screenSize as 'wide' | 'square' | 'vertical');

            const chunkResults: (Subtitle[] | null)[] = new Array(chunks.length).fill(null);

            const { outcome, nextIndex, error } = await processParallel(
                chunks, 0, chunkResults,
                provider, apiKey, model,
                settings.language, settings.autoDetectLanguage,
                effectiveScreenSize, addTokenUsage,
                (results) => {
                    // Show processed chunks in the editor in real-time (no undo entry)
                    const completed = results.filter(Boolean) as Subtitle[][];
                    if (completed.length > 0) {
                        resetSubtitles(layoutSubtitles(mergeSubtitles(completed), renderResolution, mediaFile?.width, mediaFile?.height));
                    }
                },
            );

            if (outcome === 'stopped') {
                console.log('[Pipeline] Stopped by user');
                window.electronAPI.cleanupTempAudio().catch(() => { });
                setProcessing({ status: 'idle', progress: 0 });
                return;
            }

            if (outcome === 'paused') {
                const done = chunkResults.filter(Boolean).length;
                console.log(`[Pipeline] Paused after ${done}/${chunks.length} chunks`);
                checkpointRef.current = {
                    chunks, silences, processAudioPath,
                    chunkResults, nextChunkIndex: nextIndex, effectiveScreenSize,
                };
                setCheckpointReady(true);
                setIsPausing(false);
                setProcessing({
                    status: 'paused',
                    progress: 30 + (done / chunks.length) * 60,
                    currentChunk: done,
                    totalChunks: chunks.length,
                });
                return;
            }

            if (outcome === 'error') {
                const done = chunkResults.filter(Boolean).length;
                if (done > 0) {
                    console.log(`[Error recovery] ${done}/${chunks.length} chunks completed before error — saving partial results`);
                    await savePartialResults(
                        chunkResults, effectiveScreenSize, provider, model,
                        settings, versions.length, mediaFile
                    );
                }
                throw error || new Error('Transcription failed');
            }

            await finalizeSubtitles(
                chunkResults, processAudioPath, silences,
                provider, apiKey, model, effectiveScreenSize,
                settings, versions.length, mediaFile,
            );

        } catch (error) {
            console.error('[Pipeline] Fatal error:', error);
            logSession('pipeline.generate.error', {
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            }, 'error');
            window.electronAPI?.cleanupTempAudio().catch(() => { });
            setProcessing({
                status: 'error',
                progress: 0,
                error: error instanceof Error ? error.message : 'Transcription failed',
            });
        }
    }, [mediaFile, settings, renderResolution, addTokenUsage, onProjectTouched, projectDir, setSubtitles, resetSubtitles, addVersion, setShowGenerator, versions.length]);

    // ─────────────────────── pause / resume / stop ───────────────────────

    const handleSkipHealing = useCallback(() => {
        skipHealingRef.current = true;
        logSession('pipeline.heal.skip');
    }, []);

    const handlePause = useCallback(() => {
        pauseRequestedRef.current = true;
        logSession('pipeline.pause');
        // Show "Pausing…" immediately while in-flight API calls finish (can take up to ~60s).
        setIsPausing(true);
    }, []);

    const handleStop = useCallback(() => {
        stopRequestedRef.current = true;
        pauseRequestedRef.current = false;
        translateAbortRef.current?.abort();
        window.electronAPI?.stopLocalLlm?.().catch(() => {});
        checkpointRef.current = null;
        setCheckpointReady(false);
        setIsPausing(false);
        setProcessing({ status: 'idle', progress: 0 });
        logSession('pipeline.stop');
    }, []);

    const handleResume = useCallback(async () => {
        const checkpoint = checkpointRef.current;
        if (!checkpoint) return;
        logSession('pipeline.resume', {
            nextChunk: checkpoint.nextChunkIndex,
            total: checkpoint.chunks.length,
        });

        const activeConfig = settings.providers[settings.activeProvider];
        if (providerNeedsApiKey(settings.activeProvider) && !activeConfig.apiKey) return;

        pauseRequestedRef.current = false;
        stopRequestedRef.current = false;
        setCheckpointReady(false);

        const { apiKey, model } = activeConfig;
        const provider = settings.activeProvider;
        const { chunks, silences, processAudioPath, chunkResults, nextChunkIndex, effectiveScreenSize } = checkpoint;
        const alreadyDone = chunkResults.filter(Boolean).length;

        setProcessing({
            status: 'transcribing',
            progress: 30 + (alreadyDone / chunks.length) * 60,
            currentChunk: alreadyDone,
            totalChunks: chunks.length,
        });

        try {
            const { outcome, nextIndex, error } = await processParallel(
                chunks, nextChunkIndex, chunkResults,
                provider, apiKey, model,
                settings.language, settings.autoDetectLanguage,
                effectiveScreenSize, addTokenUsage,
                (results) => {
                    const completed = results.filter(Boolean) as Subtitle[][];
                    if (completed.length > 0) {
                        resetSubtitles(layoutSubtitles(mergeSubtitles(completed), renderResolution, mediaFile?.width, mediaFile?.height));
                    }
                },
            );

            if (outcome === 'stopped') {
                console.log('[Resume] Stopped by user');
                checkpointRef.current = null;
                window.electronAPI?.cleanupTempAudio().catch(() => { });
                setProcessing({ status: 'idle', progress: 0 });
                return;
            }

            if (outcome === 'paused') {
                const done = chunkResults.filter(Boolean).length;
                console.log(`[Resume] Paused again after ${done}/${chunks.length} chunks`);
                checkpointRef.current = { ...checkpoint, chunkResults, nextChunkIndex: nextIndex };
                setCheckpointReady(true);
                setIsPausing(false);
                setProcessing({
                    status: 'paused',
                    progress: 30 + (done / chunks.length) * 60,
                    currentChunk: done,
                    totalChunks: chunks.length,
                });
                return;
            }

            if (outcome === 'error') {
                const done = chunkResults.filter(Boolean).length;
                if (done > 0) {
                    console.log(`[Error recovery] ${done}/${chunks.length} chunks completed — saving partial results`);
                    await savePartialResults(
                        chunkResults, effectiveScreenSize, provider, model,
                        settings, versions.length, mediaFile
                    );
                }
                throw error || new Error('Transcription failed');
            }

            checkpointRef.current = null;
            await finalizeSubtitles(
                chunkResults, processAudioPath, silences,
                provider, apiKey, model, effectiveScreenSize,
                settings, versions.length, mediaFile,
            );

        } catch (err) {
            console.error('[Resume] Fatal error:', err);
            setProcessing({
                status: 'error',
                progress: 0,
                error: err instanceof Error ? err.message : 'Transcription failed',
            });
        }
    }, [settings, mediaFile, renderResolution, addTokenUsage, onProjectTouched, projectDir, setSubtitles, resetSubtitles, addVersion, setShowGenerator, versions.length]);

    // ─────────────────────── translation ───────────────────────

    const handleTranslate = useCallback(async () => {
        const translatorConfig = settings.providers[settings.translator.provider];
        if (providerNeedsApiKey(settings.translator.provider) && !translatorConfig?.apiKey) return;
        if (!subtitles.length) return;

        const currentVersion = activeVersionId ? versions.find(v => v.id === activeVersionId) : null;
        const sourceLanguage = currentVersion ? currentVersion.language : settings.language;
        const isAutoDetect = currentVersion
            ? currentVersion.label?.includes('_Auto')
            : settings.autoDetectLanguage;

        if (sourceLanguage === translateTargetLang && !isAutoDetect) {
            if (window.electronAPI) {
                await window.electronAPI.showMessageBox({
                    type: 'warning',
                    title: 'Same language',
                    message: `That’s already ${translateTargetLang}.`,
                    detail: 'Pick a different language to translate into.',
                    buttons: ['OK']
                });
            }
            return;
        }

        stopRequestedRef.current = false;
        translateAbortRef.current?.abort();
        const abort = new AbortController();
        translateAbortRef.current = abort;

        setProcessing({ status: 'translating', progress: 0 });
        logSession('pipeline.translate.start', {
            provider: settings.translator.provider,
            model: settings.translator.model,
            from: sourceLanguage,
            to: translateTargetLang,
            cues: subtitles.length,
        });

        try {
            const result = await translateSubtitles(
                subtitles,
                translateTargetLang,
                settings.translator.provider,
                settings.providers[settings.translator.provider].apiKey,
                settings.translator.model,
                (progress) => {
                    if (stopRequestedRef.current || abort.signal.aborted) return;
                    setProcessing({ status: 'translating', progress });
                },
                abort.signal,
            );

            if (stopRequestedRef.current || abort.signal.aborted) {
                setProcessing({ status: 'idle', progress: 0 });
                return;
            }

            addTokenUsage(result.tokenUsage);

            const laidOut = layoutSubtitles(result.subtitles, renderResolution, mediaFile?.width, mediaFile?.height);

            const versionNumber = versions.length + 1;
            const labelStr = isAutoDetect
                ? `V${versionNumber}-${sourceLanguage}_Auto-${translateTargetLang}, ${settings.translator.model}`
                : `V${versionNumber}-${sourceLanguage}-${translateTargetLang}, ${settings.translator.model}`;

            const versionId = generateId();
            const newVersion: SubtitleVersion = {
                id: versionId,
                timestamp: Date.now(),
                provider: settings.translator.provider,
                model: settings.translator.model,
                language: translateTargetLang,
                subtitles: laidOut,
                label: labelStr,
            };

            addVersion(newVersion);
            setSubtitles(laidOut);
            setProcessing({ status: 'done', progress: 100 });
            setShowTranslator(false);

            if (projectDir) {
                onProjectTouched();
                window.electronAPI?.saveProject({
                    projectDir,
                    subtitles: laidOut,
                }).catch(() => { });
            }

            setTimeout(() => {
                setProcessing({ status: 'idle', progress: 0 });
            }, DONE_STATUS_DELAY_MS);

        } catch (error) {
            if (stopRequestedRef.current || abort.signal.aborted
                || (error instanceof Error && (error.name === 'AbortError' || /was stopped|cancelled/i.test(error.message)))) {
                setProcessing({ status: 'idle', progress: 0 });
                return;
            }
            console.error('[Translation] Error:', error);
            logSession('pipeline.translate.error', {
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            }, 'error');
            setProcessing({
                status: 'error',
                progress: 0,
                error: error instanceof Error ? error.message : 'Translation failed',
            });
        }
    }, [subtitles, translateTargetLang, settings, mediaFile, renderResolution, addTokenUsage, onProjectTouched, projectDir, setSubtitles, addVersion, activeVersionId, versions]);

    // ─────────────────────── load subtitles ───────────────────────

    const handleLoadSubtitles = useCallback(async () => {
        if (!window.electronAPI) return;

        const filePath = await window.electronAPI.openSubtitleFileDialog();
        if (!filePath) return;

        try {
            const buffer = await window.electronAPI.readFile(filePath);
            const text = new TextDecoder('utf-8').decode(new Uint8Array(buffer));
            const ext = filePath.split('.').pop() || '';
            const loaded = layoutSubtitles(parseSubtitleFile(text, ext), renderResolution, mediaFile?.width, mediaFile?.height);

            logSession('pipeline.import.subtitles', { path: filePath, count: loaded.length, format: ext });
            if (loaded.length === 0) {
                setProcessing({
                    status: 'error',
                    progress: 0,
                    error: 'No subtitles in that file. Try SRT, VTT, or ASS.',
                });
                return;
            }

            if (mediaFile && loaded.length > 0) {
                const lastSubtitle = loaded[loaded.length - 1];
                if (lastSubtitle.endTime > mediaFile.duration) {
                    const response = await window.electronAPI.showMessageBox({
                        type: 'warning',
                        buttons: ['Load anyway', 'Cancel'],
                        defaultId: 0,
                        cancelId: 1,
                        title: 'Subtitles are longer than the media',
                        message: 'Subtitles are longer than the media',
                        detail: `The text ends at ${formatDisplayTime(lastSubtitle.endTime)}, but the media ends at ${formatDisplayTime(mediaFile.duration)}. Load them anyway?`,
                    });

                    if (response.response === 1) {
                        return;
                    }
                }
            }

            setSubtitles(loaded);
            if (projectDir) {
                onProjectTouched();
            }
        } catch (err) {
            console.error('[Load subtitles] Error:', err);
            setProcessing({
                status: 'error',
                progress: 0,
                error: err instanceof Error ? err.message : 'Failed to load subtitle file',
            });
        }
    }, [setSubtitles, mediaFile, onProjectTouched, projectDir, renderResolution]);

    // ─────────────────────── render / download ───────────────────────

    const handleRenderVideo = useCallback(async () => {
        if (!subtitles.length || !mediaFile || !window.electronAPI) return;

        const assContent = generateAss(subtitles, settings.subtitleStyle, renderResolution, mediaFile);
        const defaultName = mediaFile.name.replace(/\.[^.]+$/, '_subtitles.mp4');

        const savePath = await window.electronAPI.saveFileDialog(defaultName, 'Video File', ['mp4', 'mkv', 'mov']);
        if (!savePath) return;

        logSession('pipeline.render.start', {
            output: savePath,
            resolution: renderResolution,
            cues: subtitles.length,
            source: mediaFile.path,
        });

        setProcessing({ status: 'rendering', progress: 0 });

        const unsubscribe = window.electronAPI.onBurnSubtitlesProgress(({ percent }) => {
            setProcessing({ status: 'rendering', progress: percent });
        });

        const target = getRenderTarget(renderResolution);

        try {
            await window.electronAPI.burnSubtitles(mediaFile.path, assContent, savePath, target?.width ?? null, target?.height ?? null, 'ass');
            unsubscribe();
            setProcessing({ status: 'done', progress: 100 });
            setTimeout(() => setProcessing({ status: 'idle', progress: 0 }), 3000);
        } catch (err) {
            unsubscribe();
            console.error('[Render] Video render error:', err);
            logSession('pipeline.render.error', {
                message: err instanceof Error ? err.message : String(err),
            }, 'error');
            setProcessing({
                status: 'error',
                progress: 0,
                error: err instanceof Error ? err.message : 'Video render failed',
            });
        }
    }, [subtitles, mediaFile, settings, renderResolution, setProcessing]);

    const handleDownload = useCallback(async () => {
        if (subtitles.length === 0) return;

        let ext = '.srt';
        let content = '';

        switch (exportFormat) {
            case 'vtt':
                ext = '.vtt';
                content = generateWebVtt(subtitles);
                break;
            case 'ass':
                ext = '.ass';
                content = generateAss(subtitles, settings.subtitleStyle, renderResolution, mediaFile ?? undefined);
                break;
            case 'srt':
            default:
                ext = '.srt';
                content = generateSrt(subtitles);
                break;
        }

        const defaultName = mediaFile
            ? mediaFile.name.replace(/\.[^.]+$/, ext)
            : `subtitles${ext}`;

        const formatNames: Record<string, string> = { srt: 'SRT Subtitle', vtt: 'WebVTT Subtitle', ass: 'ASS Subtitle' };

        if (window.electronAPI) {
            const savePath = await window.electronAPI.saveFileDialog(defaultName, formatNames[exportFormat], [exportFormat]);
            if (savePath) {
                await window.electronAPI.writeFile(savePath, content);
            }
        }
    }, [subtitles, mediaFile, exportFormat, settings, renderResolution]);

    return {
        processing,
        setProcessing,
        showTranslator,
        setShowTranslator,
        translateTargetLang,
        setTranslateTargetLang,
        exportFormat,
        setExportFormat,
        renderResolution,
        setRenderResolution,
        tokenStats,
        handleGenerate,
        handleTranslate,
        handleLoadSubtitles,
        handleDownload,
        handleRenderVideo,
        handlePause,
        handleStop,
        handleResume,
        handleSkipHealing,
        checkpointReady,
        isPausing,
    };
}
