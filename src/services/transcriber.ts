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
                endTime: startTime + 3, // Default 3 second duration, will be adjusted
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
- Include timestamps at natural speech breaks (every few seconds)
- Timestamps should be relative to the start of this audio clip (starting at 00:00)
- Preserve natural speech patterns and punctuation
- If there's silence, skip to the next speech segment
- Be accurate with the transcription

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

    // We do NOT filter strictly anymore, to allow capturing content missed by previous chunk.
    // However, if overlap > 0, we might want to trim the very beginning if it's clearly redundant,
    // but duplicate merging is safer. Let's just filter extreme cases (e.g. content before chunk start time).
    // The parseTranscription uses adjustedStart which IS chunk.startTime.
    // So subtitles naturally start at chunk.startTime.

    return {
        subtitles,
        rawText: text,
    };
}

// Merge subtitles from multiple chunks, handling overlaps
export function mergeSubtitles(allSubtitles: Subtitle[][]): Subtitle[] {
    const merged: Subtitle[] = [];

    for (const chunkSubs of allSubtitles) {
        for (const sub of chunkSubs) {
            // Check for overlap with existing subtitles using fuzzy matching
            // If start times are close (< 2s) AND text is similar
            const overlapping = merged.find(m => {
                const timeDiff = Math.abs(m.startTime - sub.startTime);
                if (timeDiff > 2.0) return false;

                // Normalize text for comparison
                const textA = m.text.toLowerCase().trim();
                const textB = sub.text.toLowerCase().trim();

                // If text is identical or contained within each other
                if (textA === textB || textA.includes(textB) || textB.includes(textA)) return true;

                // Fuzzy match using Levenshtein distance
                const distance = levenshteinDistance(textA, textB);
                const maxLen = Math.max(textA.length, textB.length);
                if (maxLen === 0) return true; // both empty

                // Allow 40% difference (covers slight AI variations)
                return (distance / maxLen) < 0.4;
            });

            if (!overlapping) {
                merged.push(sub);
            }
        }
    }

    // Sort by start time and reindex
    merged.sort((a, b) => a.startTime - b.startTime);
    return merged.map((sub, i) => ({ ...sub, index: i + 1 }));
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
