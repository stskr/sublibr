import type { Subtitle, AudioChunk, AIProvider, TokenUsage } from '../types';
import { generateId, formatSrtTime, formatVttTime, formatAssTime } from '../utils';
import { callProvider } from './providers';

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

// Parse transcription response into subtitles
function parseTranscription(text: string, startOffset: number): Subtitle[] {
    const subtitles: Subtitle[] = [];

    // Try to parse timestamped format first: [00:00] Text or 00:00 - Text
    const timestampPattern = /\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?\s*[-–]?\s*(.+?)(?=\[?\d{1,2}:\d{2}|\n\n|$)/gs;
    let match;

    while ((match = timestampPattern.exec(text)) !== null) {
        const [, minutes, seconds, extraSeconds, content] = match;
        const startTime = startOffset + parseInt(minutes) * 60 + parseInt(seconds) + (extraSeconds ? parseInt(extraSeconds) : 0);
        const cleanText = content.trim();

        if (cleanText) {
            subtitles.push({
                id: generateId(),
                index: subtitles.length + 1,
                startTime,
                endTime: startTime + Math.max(2, cleanText.length * 0.05), // Estimate based on chars (approx 20 chars/sec reading speed)
                text: cleanText,
            });
        }
    }

    // If no timestamps found, split by sentences
    if (subtitles.length === 0) {
        const sentences = text.split(/[.!?]+/).filter(s => s.trim());
        const avgDuration = 3; // seconds per sentence
        let currentTime = startOffset;

        for (const sentence of sentences) {
            const cleanText = sentence.trim();
            if (cleanText.length > 0) {
                subtitles.push({
                    id: generateId(),
                    index: subtitles.length + 1,
                    startTime: currentTime,
                    endTime: currentTime + avgDuration,
                    text: cleanText,
                });
                currentTime += avgDuration;
            }
        }
    }

    // Adjust end times to start of next subtitle
    for (let i = 0; i < subtitles.length - 1; i++) {
        subtitles[i].endTime = subtitles[i + 1].startTime - 0.1;
    }

    return subtitles;
}

import { getStandardTranscriptionPrompt, getHealingTranscriptionPrompt } from './prompts';

// ... (existing imports and code)

export async function transcribeChunk(
    chunk: AudioChunk,
    provider: AIProvider,
    apiKey: string,
    model: string,
    language: string,
    autoDetect: boolean,
    mode: 'standard' | 'healing' = 'standard'
): Promise<TranscriptionResult> {
    // Read and encode audio
    const audioBase64 = await audioToBase64(chunk.filePath);

    const languageInstruction = autoDetect
        ? 'Auto-detect the language of the audio.'
        : `The audio is in ${language}.`;

    const prompt = mode === 'healing'
        ? getHealingTranscriptionPrompt(languageInstruction)
        : getStandardTranscriptionPrompt(languageInstruction);

    // Infer format from extension
    const ext = chunk.filePath.split('.').pop()?.toLowerCase() || 'flac';
    const audioFormat = ext === 'mp3' ? 'mp3' : 'flac';

    const providerResponse = await callProvider(provider, apiKey, model, prompt, audioBase64, audioFormat);
    const text = providerResponse.text;

    let subtitles = parseTranscription(text, chunk.startTime);

    // Post-processing: Split long subtitles (Safety Net)
    // Max chars per subtitle line is usually ~42. Two lines ~84.
    // We'll set a safe limit of around 90 chars to allow for 2 full lines.
    const MAX_CHARS = 90;

    const splitSubtitles: Subtitle[] = [];

    for (const sub of subtitles) {
        if (sub.text.length <= MAX_CHARS) {
            splitSubtitles.push(sub);
            continue;
        }

        // Split long subtitle linearly
        const words = sub.text.split(' ');
        const duration = sub.endTime - sub.startTime;
        const totalLen = sub.text.length;

        // Determine number of splits needed
        const splitCount = Math.ceil(sub.text.length / MAX_CHARS);
        const charsPerSplit = Math.ceil(totalLen / splitCount);

        let currentStart = sub.startTime;
        let currentTextParts: string[] = [];
        let currentLen = 0;

        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            currentTextParts.push(word);
            currentLen += word.length + 1; // +1 for space

            // Check if we reached the limit or it's the last word
            const isLast = i === words.length - 1;
            const nextWordLen = !isLast ? words[i + 1].length : 0;

            if (currentLen + nextWordLen > charsPerSplit || isLast) {
                // Finalize this segment
                const segmentText = currentTextParts.join(' ');
                const segmentDuration = (segmentText.length / totalLen) * duration;

                splitSubtitles.push({
                    ...sub,
                    id: generateId(),
                    startTime: currentStart,
                    endTime: currentStart + segmentDuration,
                    text: segmentText,
                    index: 0 // re-index later
                });

                currentStart += segmentDuration;
                currentTextParts = [];
                currentLen = 0;
            }
        }

    }

    // Re-index
    subtitles = splitSubtitles.map((s, i) => ({ ...s, index: i + 1 }));

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
    MAX_CHARS_PER_LINE: 42,  // Standard subtitle line width
    MAX_LINES: 2,
    MERGE_GAP_LIMIT: 1.0,   // Max gap between subs to consider merging (seconds)
};

const MAX_CHARS_TOTAL = QUALITY.MAX_CHARS_PER_LINE * QUALITY.MAX_LINES;

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
export function enforceSubtitleQuality(subtitles: Subtitle[]): Subtitle[] {
    if (subtitles.length === 0) return [];

    // Remove degenerate entries first
    let subs = subtitles
        .filter(s => s.text.trim().length > 0 && s.endTime > s.startTime)
        .sort((a, b) => a.startTime - b.startTime);

    // Phase 1: Merge consecutive subtitles that are too short to read
    subs = mergeShortSubtitles(subs);

    // Phase 2: Extend short subtitles into available gaps
    subs = extendShortDurations(subs);

    // Phase 3: Cap maximum duration
    for (const sub of subs) {
        if (sub.endTime - sub.startTime > QUALITY.MAX_DURATION) {
            sub.endTime = sub.startTime + QUALITY.MAX_DURATION;
        }
    }

    // Phase 4: Ensure minimum gaps between subtitles
    for (let i = 0; i < subs.length - 1; i++) {
        if (subs[i].endTime > subs[i + 1].startTime - QUALITY.MIN_GAP) {
            subs[i].endTime = subs[i + 1].startTime - QUALITY.MIN_GAP;
        }
        // Safety: if this made duration negative, floor it
        if (subs[i].endTime <= subs[i].startTime) {
            subs[i].endTime = subs[i].startTime + QUALITY.MIN_DURATION;
        }
    }

    return subs.map((s, i) => ({ ...s, index: i + 1 }));
}

function mergeShortSubtitles(subs: Subtitle[]): Subtitle[] {
    const merged: Subtitle[] = [];
    let i = 0;

    while (i < subs.length) {
        const current = { ...subs[i] };
        const duration = current.endTime - current.startTime;
        const minNeeded = minReadingDuration(current.text);

        // If this subtitle is too short, try merging with next
        if (duration < minNeeded && i + 1 < subs.length) {
            const next = subs[i + 1];
            const gap = next.startTime - current.endTime;

            // Only merge if they're close together
            if (gap < QUALITY.MERGE_GAP_LIMIT) {
                const combinedText = current.text + '\n' + next.text;

                // Only merge if combined text fits within subtitle limits
                if (combinedText.length <= MAX_CHARS_TOTAL) {
                    merged.push({
                        ...current,
                        id: current.id,
                        endTime: next.endTime,
                        text: combinedText,
                    });
                    i += 2; // Skip next since we merged it
                    continue;
                }
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

// Generate SRT file content
export function generateSrt(subtitles: Subtitle[]): string {
    return subtitles.map((sub, i) => {
        return `${i + 1}\n${formatSrtTime(sub.startTime)} --> ${formatSrtTime(sub.endTime)}\n${sub.text}\n`;
    }).join('\n');
}

// Generate WebVTT file content
export function generateWebVtt(subtitles: Subtitle[]): string {
    return `WEBVTT\n\n` + subtitles.map((sub) => {
        return `${formatVttTime(sub.startTime)} --> ${formatVttTime(sub.endTime)}\n${sub.text}\n`;
    }).join('\n');
}

// Generate ASS file content
export function generateAss(subtitles: Subtitle[]): string {
    const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,50,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    const events = subtitles.map((sub) => {
        return `Dialogue: 0,${formatAssTime(sub.startTime)},${formatAssTime(sub.endTime)},Default,,0,0,0,,${sub.text.replace(/\n/g, '\\N')}`;
    }).join('\n');

    return header + events;
}
