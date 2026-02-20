import type { AudioChunk, SilenceSegment, AIProvider } from '../types';

export async function createAudioChunks(
    audioPath: string,
    tempDir: string,
    format: 'flac' | 'mp3' = 'flac',
    provider: AIProvider = 'gemini'
): Promise<{ chunks: AudioChunk[], silences: SilenceSegment[] }> {
    // OpenAI Whisper works best with 10-20 min chunks. Gemini prefers shorter chunks due to context limits.
    const TARGET_CHUNK_DURATION = provider === 'openai' ? 900 : 90; // 15 mins vs 1.5 mins
    const MIN_CHUNK_DURATION = provider === 'openai' ? 600 : 60; // 10 mins vs 1 min
    const MAX_CHUNK_DURATION = provider === 'openai' ? 1200 : 120; // 20 mins vs 2 mins
    const OVERLAP_DURATION = provider === 'openai' ? 10 : 20; // 10s overlap for Whisper, 20s for Gemini

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

        // Find the best split point near our target
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
            // If the remaining part is too small, just append it to the last chunk,
            // unless we haven't created any chunks yet
            if (chunks.length > 0) {
                // Determine if we should extend the last chunk or add a new one?
                // The loop breaks, so we should ensure the last chunk covers until duration.
                // But wait, the loop condition is `while (currentStart < duration)`.
                // If we update `currentStart` to `bestSplitPoint`, and break, we might miss the tail.

                // Let's just continue loop. The condition `minEnd` might be > duration, 
                // but `bestSplitPoint` handles `Math.min(..., duration)`.

                // Actually, logic above: `bestSplitPoint` is capped at duration.
                // If `bestSplitPoint` == duration, `currentStart` becomes duration, loop ends.
                // So this check is just for small tails that might be technically a new chunk but too short?
                // The logic: `if (duration - currentStart < MIN_CHUNK_DURATION / 2)` where `currentStart`
                // is the START of the *next* potential chunk (which is `bestSplitPoint` of current).

                // So if the *remaining* audio after this split is tiny, we should extend THIS split to the end.
                chunks[chunks.length - 1].end = duration;
                break;
            }
        }
    }

    // Generate chunk file paths
    const chunkConfigs = chunks.map((chunk, i) => ({
        start: chunk.start,
        end: chunk.end,
        outputPath: `${tempDir}/chunk_${i.toString().padStart(3, '0')}.${format}`,
    }));

    // Split audio using FFmpeg
    await window.electronAPI.splitAudio(audioPath, chunkConfigs, format);

    // Return AudioChunk objects AND silences
    return {
        chunks: chunks.map((chunk, i) => ({
            index: i,
            startTime: chunk.start,
            endTime: chunk.end,
            filePath: chunkConfigs[i].outputPath,
            overlap: chunk.overlap,
        })),
        silences
    };
}
