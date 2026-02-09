import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Subtitle, AudioChunk } from '../types';
import { generateId } from '../utils';

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
    const geminiModel = genAI.getGenerativeModel({ model });

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
                mimeType: 'audio/mp3',
                data: audioBase64,
            },
        },
    ]);

    const response = await result.response;
    const text = response.text();

    // Parse with offset adjustment (subtract overlap since it's duplicate content)
    const adjustedStart = chunk.startTime + chunk.overlap;
    const subtitles = parseTranscription(text, adjustedStart);

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
            // Check for overlap with existing subtitles
            const overlapping = merged.find(
                m => Math.abs(m.startTime - sub.startTime) < 2 &&
                    m.text.toLowerCase().includes(sub.text.slice(0, 20).toLowerCase())
            );

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
