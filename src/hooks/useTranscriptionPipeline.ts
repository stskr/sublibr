import { useState, useCallback } from 'react';
import type {
    ProcessingState,
    SessionTokenStats,
    TokenUsage,
    Subtitle,
    MediaFile,
    AppSettings,
    SubtitleVersion
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
import { healSubtitles } from '../services/healer';
import { parseSubtitleFile } from '../services/subtitleParser';
import { callTextProvider } from '../services/providers';
import { generateId, formatDisplayTime } from '../utils';

const DONE_STATUS_DELAY_MS = 2000;

interface UseTranscriptionPipelineProps {
    settings: AppSettings;
    mediaFile: MediaFile | null;
    subtitles: Subtitle[];
    versions: SubtitleVersion[];
    activeVersionId: string | null;
    setSubtitles: (subs: Subtitle[]) => void;
    addVersion: (v: SubtitleVersion) => void;
    addToRecents: (file: MediaFile, action: 'generated' | 'opened', subtitleCount?: number) => void;
    setShowGenerator: (show: boolean) => void;
}

export function useTranscriptionPipeline({
    settings,
    mediaFile,
    subtitles,
    versions,
    activeVersionId,
    setSubtitles,
    addVersion,
    addToRecents,
    setShowGenerator
}: UseTranscriptionPipelineProps) {
    const [processing, setProcessing] = useState<ProcessingState>({ status: 'idle', progress: 0 });
    const [showTranslator, setShowTranslator] = useState(false);
    const [translateTargetLang, setTranslateTargetLang] = useState('Spanish');
    const [exportFormat, setExportFormat] = useState<'srt' | 'vtt' | 'ass'>('srt');
    const [tokenStats, setTokenStats] = useState<SessionTokenStats>({
        totalInputTokens: 0,
        totalOutputTokens: 0,
        calls: [],
    });

    const addTokenUsage = useCallback((usage: TokenUsage) => {
        setTokenStats(prev => ({
            totalInputTokens: prev.totalInputTokens + usage.inputTokens,
            totalOutputTokens: prev.totalOutputTokens + usage.outputTokens,
            calls: [...prev.calls, usage],
        }));
    }, []);

    const handleGenerate = useCallback(async () => {
        const activeConfig = settings.providers[settings.activeProvider];
        // Not blocking immediately because we want to trigger Settings view if missing
        // if (!mediaFile || !activeConfig.apiKey) {
        if (!mediaFile) return;

        // Check handled by UI in App.tsx typically, but keeping safe check
        if (!activeConfig.apiKey) return;

        const { apiKey, model } = activeConfig;
        const provider = settings.activeProvider;

        try {
            if (!window.electronAPI) throw new Error('Electron API not found');

            const tempDir = await window.electronAPI.getTempPath();
            const audioFormat = provider === 'openai' ? 'mp3' : 'flac';

            let processAudioPath = mediaFile.path;
            if (mediaFile.isVideo) {
                setProcessing({ status: 'extracting', progress: 5 });
                const audioOutput = `${tempDir}/subtitles_gen_audio_${Date.now()}.${audioFormat}`;
                await window.electronAPI.extractAudio(mediaFile.path, audioOutput, audioFormat);
                processAudioPath = audioOutput;
            }

            setProcessing({ status: 'detecting-silences', progress: 15 });
            const { chunks, silences } = await createAudioChunks(processAudioPath, tempDir, audioFormat, provider);

            const allSubtitles: Subtitle[][] = [];
            const totalChunks = chunks.length;
            let previousTranscript = '';

            for (let i = 0; i < chunks.length; i++) {
                setProcessing({
                    status: 'transcribing',
                    progress: 30 + ((i / totalChunks) * 60),
                    currentChunk: i + 1,
                    totalChunks,
                });

                const result = await transcribeChunk(
                    chunks[i],
                    provider,
                    apiKey,
                    model,
                    settings.language,
                    settings.autoDetectLanguage,
                    'standard',
                    previousTranscript,
                    settings.screenSize
                );
                allSubtitles.push(result.subtitles);
                addTokenUsage(result.tokenUsage);

                // Keep the last ~1000 characters to provide as context for the next chunk
                const chunkText = result.subtitles.map(s => s.text).join(' ');
                previousTranscript = chunkText.slice(-1000);
            }

            setProcessing({ status: 'merging', progress: 90 });
            let merged = mergeSubtitles(allSubtitles);

            setProcessing({ status: 'healing', progress: 95 });
            try {
                const healResult = await healSubtitles(
                    merged,
                    processAudioPath,
                    silences,
                    provider,
                    apiKey,
                    model,
                    settings.language,
                    settings.autoDetectLanguage,
                    settings.screenSize
                );
                merged = healResult.subtitles;
                healResult.tokenUsages.forEach(addTokenUsage);
            } catch (err) {
                console.error('Healing failed:', err);
            }

            merged = enforceSubtitleQuality(merged, settings.screenSize);

            let finalLanguage = settings.language;
            let displayLanguage = settings.autoDetectLanguage ? 'Auto-Detect' : settings.language;

            if (settings.autoDetectLanguage && merged.length > 0) {
                try {
                    const sampleText = merged.slice(0, 10).map(s => s.text).join(' ');
                    const prompt = `What language is this text? Reply with ONLY the exact English name of the language (e.g., 'Spanish', 'French', 'Hebrew', 'English'). TEXT: ${sampleText}`;
                    const langResponse = await callTextProvider(provider, apiKey, model, prompt);
                    addTokenUsage(langResponse.tokenUsage);

                    const cleanLang = langResponse.text.trim().replace(/[^a-zA-Z]/g, '');
                    if (cleanLang.length > 0 && cleanLang.length < 20) {
                        finalLanguage = cleanLang;
                        displayLanguage = `Auto-Detected ${cleanLang}`;
                    }
                } catch (err) {
                    console.warn('Failed to detect language from text output', err);
                }
            }

            const versionId = generateId();
            const newVersion: SubtitleVersion = {
                id: versionId,
                timestamp: Date.now(),
                provider: settings.activeProvider,
                model: activeConfig.model,
                language: finalLanguage,
                subtitles: merged,
                label: `${displayLanguage} (${activeConfig.model})`,
            };

            addVersion(newVersion);
            setSubtitles(merged);
            setProcessing({ status: 'done', progress: 100 });
            setShowGenerator(false);

            if (mediaFile) {
                addToRecents(mediaFile, 'generated', merged.length);
                const cache = (await window.electronAPI.getStoreValue('subtitle-cache') || {}) as Record<string, Subtitle[]>;
                cache[mediaFile.path] = merged;
                window.electronAPI.setStoreValue('subtitle-cache', cache).catch(() => { });
            }

            setTimeout(() => {
                setProcessing({ status: 'idle', progress: 0 });
            }, DONE_STATUS_DELAY_MS);

        } catch (error) {
            setProcessing({
                status: 'error',
                progress: 0,
                error: error instanceof Error ? error.message : 'Transcription failed',
            });
        }
    }, [mediaFile, settings, addTokenUsage, addToRecents, setSubtitles, addVersion, setShowGenerator]);

    const handleTranslate = useCallback(async () => {
        const activeConfig = settings.providers[settings.activeProvider];
        if (!activeConfig.apiKey) return;

        const currentVersion = activeVersionId ? versions.find(v => v.id === activeVersionId) : null;
        const sourceLanguage = currentVersion ? currentVersion.language : settings.language;
        const isAutoDetect = currentVersion
            ? currentVersion.label?.includes('Auto-Detect')
            : settings.autoDetectLanguage;

        if (sourceLanguage === translateTargetLang && !isAutoDetect) {
            if (window.electronAPI) {
                await window.electronAPI.showMessageBox({
                    type: 'warning',
                    title: 'Translation Error',
                    message: `You are trying to translate to the same language (${translateTargetLang}).`,
                    detail: 'Please select a different target language for translation.',
                    buttons: ['OK']
                });
            }
            return;
        }

        setProcessing({ status: 'transcribing', progress: 0 });

        try {
            const result = await translateSubtitles(
                subtitles,
                translateTargetLang,
                settings.activeProvider,
                activeConfig.apiKey,
                activeConfig.model,
                (progress) => setProcessing({ status: 'transcribing', progress })
            );

            addTokenUsage(result.tokenUsage);

            const versionId = generateId();
            const newVersion: SubtitleVersion = {
                id: versionId,
                timestamp: Date.now(),
                provider: settings.activeProvider,
                model: activeConfig.model,
                language: translateTargetLang,
                subtitles: result.subtitles,
                label: `Translated to ${translateTargetLang} (${activeConfig.model})`,
            };

            addVersion(newVersion);
            setSubtitles(result.subtitles);
            setProcessing({ status: 'done', progress: 100 });
            setShowTranslator(false);

            if (mediaFile) {
                addToRecents(mediaFile, 'generated', result.subtitles.length);
                if (window.electronAPI) {
                    const cache = (await window.electronAPI.getStoreValue('subtitle-cache') || {}) as Record<string, Subtitle[]>;
                    cache[mediaFile.path] = result.subtitles;
                    window.electronAPI.setStoreValue('subtitle-cache', cache).catch(() => { });
                }
            }

            setTimeout(() => {
                setProcessing({ status: 'idle', progress: 0 });
            }, DONE_STATUS_DELAY_MS);

        } catch (error) {
            setProcessing({
                status: 'error',
                progress: 0,
                error: error instanceof Error ? error.message : 'Translation failed',
            });
        }
    }, [subtitles, translateTargetLang, settings, mediaFile, addTokenUsage, addToRecents, setSubtitles, addVersion, activeVersionId, versions]);

    const handleLoadSubtitles = useCallback(async () => {
        if (!window.electronAPI) return;

        const filePath = await window.electronAPI.openSubtitleFileDialog();
        if (!filePath) return;

        try {
            const buffer = await window.electronAPI.readFile(filePath);
            const text = new TextDecoder('utf-8').decode(new Uint8Array(buffer));
            const ext = filePath.split('.').pop() || '';
            const loaded = parseSubtitleFile(text, ext);

            if (loaded.length === 0) {
                setProcessing({
                    status: 'error',
                    progress: 0,
                    error: 'No subtitles found in the file. Please check the file format.',
                });
                return;
            }

            if (mediaFile && loaded.length > 0) {
                const lastSubtitle = loaded[loaded.length - 1];
                if (lastSubtitle.endTime > mediaFile.duration) {
                    const response = await window.electronAPI.showMessageBox({
                        type: 'warning',
                        buttons: ['Load Anyway', 'Cancel'],
                        defaultId: 0,
                        cancelId: 1,
                        title: 'Subtitle Duration Warning',
                        message: 'Subtitles are longer than the media file',
                        detail: `The text ends at ${formatDisplayTime(lastSubtitle.endTime)}, but the media ends at ${formatDisplayTime(mediaFile.duration)}.\n\nDo you want to continue?`,
                    });

                    if (response.response === 1) {
                        return;
                    }
                }
            }

            setSubtitles(loaded);
            if (mediaFile) {
                addToRecents(mediaFile, 'opened');
            }
        } catch (err) {
            setProcessing({
                status: 'error',
                progress: 0,
                error: err instanceof Error ? err.message : 'Failed to load subtitle file',
            });
        }
    }, [setSubtitles, mediaFile, addToRecents]);

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
                content = generateAss(subtitles);
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
    }, [subtitles, mediaFile, exportFormat]);

    return {
        processing,
        setProcessing,
        showTranslator,
        setShowTranslator,
        translateTargetLang,
        setTranslateTargetLang,
        exportFormat,
        setExportFormat,
        tokenStats,
        handleGenerate,
        handleTranslate,
        handleLoadSubtitles,
        handleDownload
    };
}
