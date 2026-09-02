import type { Subtitle, AudioChunk, AIProvider, TokenUsage, ScreenSize, SubtitleStyle, MediaFile } from '../types';
import { DEFAULT_SUBTITLE_STYLE, getPlayRes, fontSizeForPlayRes, effectiveSubtitlePositionY } from '../types';
import { generateId, formatSrtTime, formatVttTime, formatAssTime, detectDirection, applyRtlTypography, wrapRtlIsolate, getIsoLanguage } from '../utils';
import { callProvider, callTextProvider, isAsrModel, callLocalTranscribe, resolveLocalWhisperModel } from './providers';
import { getTranslationPrompt } from '../prompts/shared/translation';
import {
    applyParsedTranslations,
    formatTranslationInput,
    parseTranslationResponse,
    translationHitCount,
} from './translationParse';

export interface TranscriptionResult {
    subtitles: Subtitle[];
    tokenUsage: TokenUsage;
}

// Convert audio file to base64 (chunked to avoid O(n^2) string concatenation)
async function audioToBase64(filePath: string): Promise<string> {
    const buffer = await window.electronAPI.readFile(filePath);
    const bytes = new Uint8Array(buffer);
    const CHUNK_SIZE = 8192;
    const parts: string[] = [];
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
        const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
        parts.push(String.fromCharCode.apply(null, chunk as unknown as number[]));
    }
    return btoa(parts.join(''));
}

// Build standard subtitles from individual word-level timestamps (native Whisper)
function buildSubtitlesFromWords(words: { start: number; end: number; word: string }[], startOffset: number, maxLines: number, maxCharsPerLine: number): Subtitle[] {
    const subtitles: Subtitle[] = [];
    const maxWords = LAYOUT.maxWordsPerCue;

    let currentText = "";
    let currentStart = 0;
    let currentEnd = 0;

    for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const cleanWord = w.word.trim();
        if (!cleanWord) continue;

        if (currentText === "") {
            currentText = cleanWord;
            currentStart = w.start;
            currentEnd = w.end;
            continue;
        }

        const potentialText = currentText + " " + cleanWord;
        const gap = w.start - currentEnd;
        const duration = w.end - currentStart;
        const isEndPunctuation = /[.!?]$/.test(currentText);
        const isComma = /[,]$/.test(currentText);
        const nextWordCount = tokenize(potentialText).length;

        let shouldBreak = false;

        if (nextWordCount > maxWords || potentialText.length > maxLines * maxCharsPerLine) {
            shouldBreak = true;
        } else if (duration >= 5.5) {
            shouldBreak = true;
        } else if (gap >= 0.5) {
            shouldBreak = true;
        } else if (isEndPunctuation && tokenize(currentText).length >= 4) {
            shouldBreak = true;
        } else if (gap >= 0.2 && tokenize(currentText).length >= LAYOUT.maxWordsPerLine) {
            shouldBreak = true;
        } else if (isComma && tokenize(currentText).length >= LAYOUT.maxWordsPerLine - 1) {
            shouldBreak = true;
        }

        if (shouldBreak) {
            subtitles.push({
                id: generateId(),
                index: subtitles.length + 1,
                startTime: startOffset + currentStart,
                endTime: startOffset + currentEnd,
                text: layoutCueText(currentText),
            });
            currentText = cleanWord;
            currentStart = w.start;
            currentEnd = w.end;
        } else {
            currentText = potentialText;
            currentEnd = w.end;
        }
    }

    if (currentText !== "") {
        subtitles.push({
            id: generateId(),
            index: subtitles.length + 1,
            startTime: startOffset + currentStart,
            endTime: startOffset + currentEnd,
            text: layoutCueText(currentText),
        });
    }

    return subtitles;
}

function buildSubtitlesFromSegments(
    segments: { start: number; end: number; text: string }[],
    startOffset: number,
): Subtitle[] {
    return segments
        .map(s => ({ start: s.start, end: s.end, text: (s.text ?? '').trim() }))
        .filter(s => s.text)
        .map((s, i) => ({
            id: generateId(),
            index: i + 1,
            startTime: startOffset + s.start,
            endTime: startOffset + s.end,
            text: s.text,
        }));
}


import { getStandardTranscriptionPrompt as getGeminiTranscriptionPrompt } from '../prompts/gemini/transcription';
import { getHealingTranscriptionPrompt as getGeminiHealingPrompt } from '../prompts/gemini/healing';
import { getOpenAITranscriptionPrompt } from '../prompts/openai/transcription';
import { getOpenAIHealingPrompt } from '../prompts/openai/healing';
import { layoutCueText, layoutSubtitles, LAYOUT, tokenize } from './subtitleLayout';

export function getScreenSizeConstraints(screenSize: ScreenSize) {
    switch (screenSize) {
        case 'square': return { maxLines: 2, maxCharsPerLine: 25 };
        case 'vertical': return { maxLines: 2, maxCharsPerLine: 15 };
        case 'wide':
        default:
            return { maxLines: 2, maxCharsPerLine: 40 };
    }
}

export async function transcribeChunk(
    chunk: AudioChunk,
    provider: AIProvider,
    apiKey: string,
    model: string,
    language: string,
    autoDetect: boolean,
    mode: 'standard' | 'healing' = 'standard',
    previousTranscript?: string,
    screenSize: ScreenSize = 'wide'
): Promise<TranscriptionResult> {
    const sttModel = provider === 'local' ? resolveLocalWhisperModel(language) : model;
    if (!isAsrModel(sttModel)) {
        throw new Error(
            `${sttModel} does not return timestamps and cannot be used for subtitles.`,
        );
    }

    const audioBase64 = provider === 'local' ? '' : await audioToBase64(chunk.filePath);

    const languageInstruction = autoDetect
        ? 'Auto-detect the language of the audio.'
        : `The audio is in ${language}.`;

    const { maxLines, maxCharsPerLine } = getScreenSizeConstraints(screenSize);

    let prompt = '';
    if (provider === 'gemini') {
        prompt = mode === 'healing'
            ? getGeminiHealingPrompt(languageInstruction, maxLines, maxCharsPerLine)
            : getGeminiTranscriptionPrompt(languageInstruction, maxLines, maxCharsPerLine);
    } else {
        prompt = mode === 'healing'
            ? getOpenAIHealingPrompt(languageInstruction, maxLines, maxCharsPerLine)
            : getOpenAITranscriptionPrompt(languageInstruction, maxLines, maxCharsPerLine);
    }

    // Infer format from extension
    const ext = chunk.filePath.split('.').pop()?.toLowerCase() || 'flac';
    const audioFormat = ext === 'mp3' ? 'mp3' : 'flac';

    const languageIso = getIsoLanguage(language, autoDetect);

    const providerResponse = provider === 'local'
        ? await callLocalTranscribe(chunk.filePath, languageIso, sttModel)
        : await callProvider(provider, apiKey, sttModel, prompt, audioBase64, audioFormat, languageIso, previousTranscript);
    const text = providerResponse.text;

    let subtitles: Subtitle[] = [];
    let data: {
        words?: { start: number; end: number; word: string }[];
        segments?: { start: number; end: number; text: string }[];
        text?: string;
    };
    try {
        data = JSON.parse(text) as typeof data;
    } catch {
        throw new Error(
            `${sttModel} returned a transcript with no timestamps. Subtitles need word-level times from the API — this result cannot be used.`,
        );
    }

    if (data.words && data.words.length > 0) {
        subtitles = buildSubtitlesFromWords(data.words, chunk.startTime, maxLines, maxCharsPerLine);
    } else if (data.segments && data.segments.length > 0) {
        subtitles = buildSubtitlesFromSegments(data.segments, chunk.startTime);
    } else if ((data.text ?? '').trim()) {
        throw new Error(
            `${sttModel} returned a transcript with no timestamps. Subtitles need word-level times from the API — this result cannot be used.`,
        );
    }

    subtitles = layoutSubtitles(subtitles, screenSize);

    return {
        subtitles,
        tokenUsage: providerResponse.tokenUsage,
    };
}

// Merge subtitles using a "Smart Stitching" approach
// We process chunks pairwise and "stitch" them together, handling the boundary 
// where a subtitle might span across the cut point.
export function mergeSubtitles(allSubtitles: Subtitle[][]): Subtitle[] {
    if (allSubtitles.length === 0) return [];

    // Start with the first chunk
    let finalSubtitles = [...allSubtitles[0]];

    for (let i = 1; i < allSubtitles.length; i++) {
        const nextChunkSubs = allSubtitles[i];
        if (nextChunkSubs.length === 0) continue;

        // The exact time where the second chunk begins its audio
        const stitchPoint = nextChunkSubs[0].startTime;

        // Define Overlap Zone (up to 20s)
        const overlapEnd = stitchPoint + 20;

        // DECISION: Which chunk provides better quality in the overlap zone?
        // We compare the text density in the zone [stitchPoint, overlapEnd]

        const prevChunkInOverlap = finalSubtitles.filter(s => s.startTime >= stitchPoint && s.startTime < overlapEnd);
        const nextChunkInOverlap = nextChunkSubs.filter(s => s.startTime < overlapEnd);

        const prevDensity = prevChunkInOverlap.reduce((acc, s) => acc + s.text.length, 0);
        const nextDensity = nextChunkInOverlap.reduce((acc, s) => acc + s.text.length, 0);

        let cutTime: number;

        if (nextDensity >= prevDensity) {
            // New chunk is better. We switch exactly at the stitchPoint.
            // 1. Remove everything from Old Chunk that starts after stitchPoint
            finalSubtitles = finalSubtitles.filter(s => s.startTime < stitchPoint);

            // 2. Handle "Straddling": The last sub of Old Chunk might cross stitchPoint.
            // e.g. Old: [10, 14] "Hello world". StitchPoint: 12. Next: [12, 14] "world".
            const lastSub = finalSubtitles[finalSubtitles.length - 1];
            if (lastSub && lastSub.endTime > stitchPoint) {
                // It crosses the boundary.
                // We trim it to the stitch point to avoid collision with the new chunk
                // But we add a small safety gap (-0.05s)
                lastSub.endTime = Math.max(lastSub.startTime, stitchPoint - 0.05);
            }

            // 3. Add the New Chunk
            finalSubtitles.push(...nextChunkSubs);
        } else {
            // Old chunk is better. We keep it until overlapEnd.
            // We only add New Chunk subs that start AFTER overlapEnd.
            cutTime = overlapEnd;
            const nextChunkClean = nextChunkSubs.filter(s => s.startTime >= cutTime);

            finalSubtitles.push(...nextChunkClean);
        }
    }

    // Final Cleanup: Sort, Fix Overlaps, and Enforce Gaps
    finalSubtitles.sort((a, b) => a.startTime - b.startTime);

    const cleaned: Subtitle[] = [];
    if (finalSubtitles.length > 0) cleaned.push(finalSubtitles[0]);

    for (let i = 1; i < finalSubtitles.length; i++) {
        const current = finalSubtitles[i];
        const prev = cleaned[cleaned.length - 1];

        // 1. Resolve Overlaps
        if (current.startTime < prev.endTime) {
            const overlap = prev.endTime - current.startTime;

            // If they overlap significantly and text is similar, drop the current one (duplicate)
            const normalize = (str: string) => str.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
            const normA = normalize(prev.text);
            const normB = normalize(current.text);

            if (normA.includes(normB) || normB.includes(normA) || overlap > 0.5) {
                if (current.text.length > prev.text.length) {
                    // Current is longer — trim prev to make room
                    prev.endTime = current.startTime - 0.05;
                } else {
                    // Prev is longer or equal — drop duplicate if significant overlap
                    if (overlap > 1.0) continue;
                    prev.endTime = current.startTime - 0.05;
                }
            } else {
                // Different content, just overlap. Trim prev.
                prev.endTime = current.startTime - 0.05;
            }
        }

        // 2. Enforce Minimum Gap (10ms) to ensure they are distinct in UI
        if (current.startTime <= prev.endTime) {
            prev.endTime = current.startTime - 0.01;
            // Sanity check: if this makes prev have 0 duration
            if (prev.endTime <= prev.startTime) {
                // This implies extreme overlap.
                // We should probably just drop prev if it's swallowed.
                // For now, let's keep it minimal
                prev.endTime = prev.startTime + 0.1;
                current.startTime = prev.endTime + 0.01;
            }
        }

        cleaned.push(current);
    }

    return cleaned.map((sub, i) => ({ ...sub, index: i + 1 }));
}

// --- Subtitle Quality Enforcement ---

const QUALITY = {
    MIN_DURATION: 1.0,       // Minimum display time (seconds)
    MAX_DURATION: 7.0,       // Maximum display time (seconds)
    READING_SPEED: 20,       // Characters per second (comfortable pace)
    MIN_GAP: 0.05,           // Minimum gap between subtitles (50ms)
    MERGE_GAP_LIMIT: 1.0,   // Max gap between subs to consider merging (seconds)
};

function minReadingDuration(text: string): number {
    return Math.max(QUALITY.MIN_DURATION, text.length / QUALITY.READING_SPEED);
}

/**
 * Post-processing pass to ensure all subtitles meet quality standards:
 * - Minimum display duration (based on reading speed)
 * - Merge consecutive too-short subtitles where possible
 * - Extend short subtitles into available space
 * - Cap maximum duration
 * - Remove degenerate entries (empty text, zero/negative duration)
 */
export function enforceSubtitleQuality(subtitles: Subtitle[], screenSize: ScreenSize = 'wide'): Subtitle[] {
    if (subtitles.length === 0) return [];

    // Remove degenerate entries first
    let subs = subtitles
        .filter(s => s.text.trim().length > 0 && s.endTime > s.startTime)
        .sort((a, b) => a.startTime - b.startTime);

    subs = mergeShortSubtitles(subs);
    subs = extendShortDurations(subs);

    for (const sub of subs) {
        if (sub.endTime - sub.startTime > QUALITY.MAX_DURATION) {
            sub.endTime = sub.startTime + QUALITY.MAX_DURATION;
        }
    }

    for (let i = 0; i < subs.length - 1; i++) {
        if (subs[i].endTime > subs[i + 1].startTime - QUALITY.MIN_GAP) {
            subs[i].endTime = subs[i + 1].startTime - QUALITY.MIN_GAP;
        }
        if (subs[i].endTime <= subs[i].startTime) {
            subs[i].endTime = subs[i].startTime + QUALITY.MIN_DURATION;
        }
    }

    return layoutSubtitles(subs, screenSize);
}

function mergeShortSubtitles(subs: Subtitle[]): Subtitle[] {
    const merged: Subtitle[] = [];
    let i = 0;

    while (i < subs.length) {
        const current = { ...subs[i] };
        const duration = current.endTime - current.startTime;
        const minNeeded = minReadingDuration(current.text);

        if (duration < minNeeded && i + 1 < subs.length) {
            const next = subs[i + 1];
            const gap = next.startTime - current.endTime;
            const combinedWords = tokenize(`${current.text} ${next.text}`);

            if (gap < QUALITY.MERGE_GAP_LIMIT && combinedWords.length <= LAYOUT.maxWordsPerCue) {
                merged.push({
                    ...current,
                    id: current.id,
                    endTime: next.endTime,
                    text: combinedWords.join(' '),
                });
                i += 2;
                continue;
            }
        }

        merged.push(current);
        i++;
    }

    return merged;
}

function extendShortDurations(subs: Subtitle[]): Subtitle[] {
    for (let i = 0; i < subs.length; i++) {
        const sub = subs[i];
        const duration = sub.endTime - sub.startTime;
        const minNeeded = minReadingDuration(sub.text);

        if (duration < minNeeded) {
            // Extend end time, but don't overlap with next subtitle
            const maxEnd = i + 1 < subs.length
                ? subs[i + 1].startTime - QUALITY.MIN_GAP
                : sub.startTime + minNeeded;

            sub.endTime = Math.min(sub.startTime + minNeeded, maxEnd);
        }
    }

    return subs;
}

// Helper to strip source tags like <00:00:01.000>
function stripSourceTags(text: string): string {
    return text.replace(/<[^>]+>/g, '').trim();
}

// Generate SRT file content
export function generateSrt(subtitles: Subtitle[]): string {
    return subtitles.map((sub, i) => {
        const cleanText = applyRtlTypography(stripSourceTags(sub.text));
        return `${i + 1}\n${formatSrtTime(sub.startTime)} --> ${formatSrtTime(sub.endTime)}\n${cleanText}\n`;
    }).join('\n'); // Exactly one blank line between sequences due to the trailing \n in the map combined with \n in the join
}

// Generate WebVTT file content
export function generateWebVtt(subtitles: Subtitle[]): string {
    return `WEBVTT\n\n` + subtitles.map((sub, i) => {
        // VTT specifies no blank lines inside the cue text
        const cleanText = applyRtlTypography(stripSourceTags(sub.text)).replace(/\n\s*\n/g, '\n');
        return `${i + 1}\n${formatVttTime(sub.startTime)} --> ${formatVttTime(sub.endTime)}\n${cleanText}\n`;
    }).join('\n'); // Exactly one blank line between cues
}

// Convert hex color (#RRGGBB) to ASS &HAABBGGRR format (alpha 0=opaque, 255=transparent)
function hexToAssColor(hex: string, alpha = 0): string {
    const h = hex.replace('#', '').toUpperCase().padEnd(6, '0');
    const r = h.slice(0, 2);
    const g = h.slice(2, 4);
    const b = h.slice(4, 6);
    const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
        .toString(16).padStart(2, '0').toUpperCase();
    return `&H${a}${b}${g}${r}`;
}

// Generate ASS file content
export function generateAss(
    subtitles: Subtitle[],
    style: SubtitleStyle = DEFAULT_SUBTITLE_STYLE,
    renderResolution: ScreenSize = 'wide',
    mediaFile?: Pick<MediaFile, 'width' | 'height'>,
): string {
    const primaryColor  = hexToAssColor(style.textColor);
    const outlineColor  = hexToAssColor(style.outlineColor);
    const shadowDepth   = Math.max(style.shadowOffsetX, style.shadowOffsetY);

    const outline = (style.outlineMode === 'outline' || style.outlineMode === 'both')
        ? style.outlineWidth.toFixed(1) : '0.0';
    const shadow  = (style.outlineMode === 'shadow'  || style.outlineMode === 'both')
        ? shadowDepth.toFixed(1) : '0.0';

    // BorderStyle 3 = opaque background box; 1 = outline+shadow
    const borderStyle = style.backgroundEnabled ? 3 : 1;
    const backColor = style.backgroundEnabled
        ? hexToAssColor(style.backgroundColor, 1 - style.backgroundOpacity)
        : hexToAssColor(style.shadowColor); // BackColour = shadow color in BorderStyle 1

    // Strip quotes from font-family if present (e.g. "'Courier New'" → "Courier New")
    const fontName = style.fontFamily.replace(/^'|'$/g, '');

    const [playResX, playResY] = getPlayRes(renderResolution, mediaFile?.width, mediaFile?.height);
    const fontSize = fontSizeForPlayRes(style.fontSize ?? 56, renderResolution, mediaFile?.width, mediaFile?.height);

    const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${playResX}
PlayResY: ${playResY}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primaryColor},&HFFFFFFFF,${outlineColor},${backColor},0,0,0,0,100,100,0,0,${borderStyle},${outline},${shadow},2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    // \an2 = bottom-center anchor; \pos(x,y) places that anchor at the given coords
    const posX = Math.round((style.positionX ?? 50) / 100 * playResX);
    const posY = Math.round(effectiveSubtitlePositionY(style, renderResolution, mediaFile?.width, mediaFile?.height) / 100 * playResY);
    const posTag = `{\\an2\\pos(${posX},${posY})}`;

    const events = subtitles.map((sub) => {
        const cleanText = applyRtlTypography(stripSourceTags(sub.text));
        const directed = detectDirection(cleanText) === 'rtl'
            ? cleanText.split('\n').map(wrapRtlIsolate).join('\\N')
            : cleanText.replace(/\n/g, '\\N');
        return `Dialogue: 0,${formatAssTime(sub.startTime)},${formatAssTime(sub.endTime)},Default,,0,0,0,,${posTag}${directed}`;
    }).join('\n');

    return header + events;
}

function chunkSubtitles(subtitles: Subtitle[], maxItems: number, maxChars: number): Subtitle[][] {
    const chunks: Subtitle[][] = [];
    let current: Subtitle[] = [];
    let chars = 0;

    for (const sub of subtitles) {
        const nextLen = chars + sub.text.length;
        if (current.length > 0 && (current.length >= maxItems || nextLen > maxChars)) {
            chunks.push(current);
            current = [];
            chars = 0;
        }
        current.push(sub);
        chars += sub.text.length;
    }
    if (current.length > 0) chunks.push(current);
    return chunks;
}

export async function translateSubtitles(
    subtitles: Subtitle[],
    targetLanguage: string,
    provider: AIProvider,
    apiKey: string,
    model: string,
    onProgress?: (progress: number) => void,
    signal?: AbortSignal,
): Promise<TranscriptionResult> {
    if (subtitles.length === 0) return { subtitles: [], tokenUsage: { inputTokens: 0, outputTokens: 0, provider, model, timestamp: Date.now() } };

    const throwIfAborted = () => {
        if (signal?.aborted) {
            const err = new Error('Translation cancelled');
            err.name = 'AbortError';
            throw err;
        }
    };

    const promptBase = getTranslationPrompt(targetLanguage);
    const maxItems = provider === 'local' ? 8 : 40;
    const maxChars = provider === 'local' ? 900 : 3000;
    const subtitleChunks = chunkSubtitles(subtitles, maxItems, maxChars);

    const translatedSubtitles: Subtitle[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const totalChunks = subtitleChunks.length;

    const translateChunk = async (chunk: Subtitle[]): Promise<Subtitle[]> => {
        throwIfAborted();
        const prompt = `${promptBase}\n\n${formatTranslationInput(chunk.map(s => s.text))}`;
        const response = await callTextProvider(provider, apiKey, model, prompt);
        throwIfAborted();
        totalInputTokens += response.tokenUsage.inputTokens;
        totalOutputTokens += response.tokenUsage.outputTokens;

        const parsed = parseTranslationResponse(response.text);
        const hits = translationHitCount(chunk, parsed);
        const minHits = chunk.length === 1 ? 1 : Math.ceil(chunk.length * 0.6);

        if (hits < minHits && chunk.length > 1) {
            const mid = Math.ceil(chunk.length / 2);
            const left = await translateChunk(chunk.slice(0, mid));
            const right = await translateChunk(chunk.slice(mid));
            return [...left, ...right];
        }

        if (hits < chunk.length) {
            console.warn(
                `Translation recovered ${hits}/${chunk.length} cues in a chunk; keeping originals for the rest.`,
            );
        }

        const texts = applyParsedTranslations(chunk, parsed);
        return chunk.map((sub, i) => ({ ...sub, text: texts[i] }));
    };

    for (let i = 0; i < totalChunks; i++) {
        throwIfAborted();
        const baseProgress = (i / totalChunks) * 100;
        const nextProgress = ((i + 1) / totalChunks) * 100;
        const targetSimulatedProgress = baseProgress + (nextProgress - baseProgress) * 0.85;

        if (onProgress) onProgress(baseProgress);

        let simulatedProgress = baseProgress;
        const progressInterval = onProgress ? setInterval(() => {
            if (signal?.aborted) return;
            simulatedProgress += (targetSimulatedProgress - simulatedProgress) * 0.05;
            if (simulatedProgress > targetSimulatedProgress - 0.5) {
                simulatedProgress = targetSimulatedProgress;
            }
            onProgress(simulatedProgress);
        }, 500) : undefined;

        try {
            translatedSubtitles.push(...await translateChunk(subtitleChunks[i]));
        } catch (error) {
            if (error instanceof Error && (error.name === 'AbortError' || /was stopped|cancelled/i.test(error.message))) {
                const abort = new Error('Translation cancelled');
                abort.name = 'AbortError';
                throw abort;
            }
            console.error('Translation chunk failed, falling back to original:', error);
            if (subtitleChunks[i].length > 1) {
                try {
                    const mid = Math.ceil(subtitleChunks[i].length / 2);
                    translatedSubtitles.push(...await translateChunk(subtitleChunks[i].slice(0, mid)));
                    translatedSubtitles.push(...await translateChunk(subtitleChunks[i].slice(mid)));
                } catch (retryError) {
                    if (retryError instanceof Error && retryError.name === 'AbortError') throw retryError;
                    console.error('Translation retry failed, keeping originals:', retryError);
                    translatedSubtitles.push(...subtitleChunks[i]);
                }
            } else {
                translatedSubtitles.push(...subtitleChunks[i]);
            }
        } finally {
            if (progressInterval) clearInterval(progressInterval);
        }
    }

    if (onProgress) onProgress(100);

    return {
        subtitles: translatedSubtitles.sort((a, b) => a.startTime - b.startTime),
        tokenUsage: {
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            provider,
            model,
            timestamp: Date.now()
        }
    };
}
