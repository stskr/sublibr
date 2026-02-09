import type { AudioChunk } from '../types';

interface SilenceSegment {
    start: number;
    end: number;
}

const TARGET_CHUNK_DURATION = 90; // 1.5 minutes (as requested)
const MIN_CHUNK_DURATION = 90;
const MAX_CHUNK_DURATION = 130;
const OVERLAP_DURATION = 20; // 20s Safety buffer to catch EVERYTHING

export async function createAudioChunks(
    audioPath: string,
    tempDir: string
): Promise<AudioChunk[]> {
    // Get total duration
    const duration = await window.electronAPI.getDuration(audioPath);

    // Detect silences (threshold: -50dB, min duration: 1s)
    const silences: SilenceSegment[] = await window.electronAPI.detectSilences(
        audioPath,
        -25, // Much more lenient threshold (handle noisy audio)
        0.3  // Shorter duration (catch breaths/short pauses)
    );

    // Calculate chunk boundaries
    const chunks: { start: number; end: number; overlap: number }[] = [];
    let currentStart = 0;

    while (currentStart < duration) {
        const targetEnd = currentStart + TARGET_CHUNK_DURATION;
        const maxEnd = currentStart + MAX_CHUNK_DURATION;
        const minEnd = currentStart + MIN_CHUNK_DURATION;

        // Find the best silence point near our target
        let bestSplitPoint = Math.min(targetEnd, duration);

        // Look for silences between minEnd and maxEnd
        const candidateSilences = silences.filter(
            s => s.start >= minEnd && s.start <= maxEnd
        );

        if (candidateSilences.length > 0) {
            // Pick the silence closest to target
            candidateSilences.sort(
                (a, b) => Math.abs(a.start - targetEnd) - Math.abs(b.start - targetEnd)
            );
            // Split at the middle of the silence
            const silence = candidateSilences[0];
            bestSplitPoint = (silence.start + silence.end) / 2;
        }

        // Don't exceed duration
        bestSplitPoint = Math.min(bestSplitPoint, duration);

        // Calculate overlap (except for first chunk)
        const overlap = chunks.length > 0 ? OVERLAP_DURATION : 0;
        const actualStart = Math.max(0, currentStart - overlap);

        chunks.push({
            start: actualStart,
            end: bestSplitPoint,
            overlap,
        });

        currentStart = bestSplitPoint;

        // If we're very close to the end, just include the rest
        if (duration - currentStart < MIN_CHUNK_DURATION / 2) {
            break;
        }
    }

    // Generate chunk file paths
    const chunkConfigs = chunks.map((chunk, i) => ({
        start: chunk.start,
        end: chunk.end,
        outputPath: `${tempDir}/chunk_${i.toString().padStart(3, '0')}.flac`,
    }));

    // Split audio using FFmpeg
    await window.electronAPI.splitAudio(audioPath, chunkConfigs);

    // Return AudioChunk objects
    return chunks.map((chunk, i) => ({
        index: i,
        startTime: chunk.start,
        endTime: chunk.end,
        filePath: chunkConfigs[i].outputPath,
        overlap: chunk.overlap,
    }));
}
