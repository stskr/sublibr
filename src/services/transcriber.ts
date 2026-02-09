import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Subtitle, AudioChunk } from '../types';
import { generateId, levenshteinDistance } from '../utils';

export interface TranscriptionResult {
    subtitles: Subtitle[];
    rawText: string;
}

// Convert audio file to base64
async function audioToBase64(filePath: string): Promise<string> {
    const buffer = await window.electronAPI.readFile(filePath);
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
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

export async function transcribeChunk(
    chunk: AudioChunk,
    apiKey: string,
    model: string,
    language: string,
    autoDetect: boolean
): Promise<TranscriptionResult> {
    const genAI = new GoogleGenerativeAI(apiKey);

    // Handle legacy/deprecated model names by upgrading to 2.5
    let effectiveModel = model;
    if (model.includes('gemini-1.5-flash')) effectiveModel = 'gemini-2.5-flash';
    if (model.includes('gemini-1.5-pro')) effectiveModel = 'gemini-2.5-pro';

    const geminiModel = genAI.getGenerativeModel({ model: effectiveModel });

    // Read and encode audio
    const audioBase64 = await audioToBase64(chunk.filePath);

    const languageInstruction = autoDetect
        ? 'Auto-detect the language of the audio.'
        : `The audio is in ${language}.`;

    const prompt = `Transcribe this audio file into text with timestamps. ${languageInstruction}
    
Format your response as:
[MM:SS] Transcribed text for this segment
[MM:SS] Next segment of text
...

Rules:
- Transcribe VERBATIM. Do not summarize. Do not omit any speech.
- Capture every word spoken, even fillers if they are distinct.
- Include timestamps at natural speech breaks (every few seconds).
- Timestamps should be relative to the start of this audio clip (starting at 00:00).
- Preserve natural speech patterns and punctuation.
- If there's silence, skip to the next speech segment.
- Be accurate with the transcription.

Transcribe the audio now:`;

    const result = await geminiModel.generateContent([
        prompt,
        {
            inlineData: {
                mimeType: 'audio/flac',
                data: audioBase64,
            },
        },
    ]);

    const response = await result.response;
    const text = response.text();

    // Parse with correct time base (don't add overlap to buffer time)
    const adjustedStart = chunk.startTime;
    let subtitles = parseTranscription(text, adjustedStart);

    // MAX SAFETY STRATEGY:
    // We do NOT filter anything here. We let the overlap pass through 100%.
    // We rely entirely on the fuzzy matcher in 'mergeSubtitles' to handle deduplication.
    // This ensures that if a sentence was missed in the previous chunk but caught here, it stays.

    return {
        subtitles,
        rawText: text,
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

            // Handle Straddling found in the Old Chunk (if any sub crosses overlapEnd)
            // Actually, if we keep Old Chunk, we just append New Chunk.
            // But we must ensure the previous sub doesn't overlap the new first sub.
            // (Handled by the final cleanup pass)

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

            // Check short substring vs long
            if (normA.includes(normB) || normB.includes(normA) || overlap > 0.5) {
                // Determine which to keep based on length
                if (current.text.length > prev.text.length) {
                    // Current is better, replace prev
                    // But we must respect prev's start time? No, keep current's timing.
                    // Actually, if we replace, we might create a gap before it.
                    // Best strategy: Trim prev to current.startTime
                    prev.endTime = current.startTime - 0.05;
                } else {
                    // Prev is better (or equal), drop current?
                    // If we drop current, we lose it.
                    // But if it's a duplicate, we want to lose it.
                    if (overlap > 1.0) continue; // Skip current

                    // If overlap is small, just trim prev
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

// Generate SRT file content
export function generateSrt(subtitles: Subtitle[]): string {
    return subtitles.map((sub, i) => {
        const formatTime = (seconds: number) => {
            const hours = Math.floor(seconds / 3600);
            const mins = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);
            const ms = Math.floor((seconds % 1) * 1000);
            return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
        };

        return `${i + 1}\n${formatTime(sub.startTime)} --> ${formatTime(sub.endTime)}\n${sub.text}\n`;
    }).join('\n');
}
