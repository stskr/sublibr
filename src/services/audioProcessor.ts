import type { AudioChunk, SilenceSegment, AIProvider } from '../types';
import { TRANSCRIBE_LIMITS } from './providers';

export interface ChunkPlan {
    /** Inclusive file start (seconds), includes overlap with the previous chunk. */
    start: number;
    /** Exclusive file end (seconds). */
    end: number;
    overlap: number;
}

const OVERLAP_SEC = 10;
const MIN_UNIQUE_SEC = 20;
const SIZE_HEADROOM = 0.95;
const DURATION_SLACK_SEC = 0.5;

/**
 * Tightest per-chunk duration that still satisfies both the model's time cap
 * and its upload-size cap, given the measured bitrate of this file.
 */
export function effectiveMaxChunkDuration(
    durationSec: number,
    fileBytes: number,
    limits: { maxDurationSec: number; maxBytes: number },
): number {
    if (durationSec <= 0) return limits.maxDurationSec;
    const bytesPerSec = fileBytes / durationSec;
    const maxBySize = bytesPerSec > 0
        ? (limits.maxBytes / bytesPerSec) * SIZE_HEADROOM
        : limits.maxDurationSec;
    return Math.max(MIN_UNIQUE_SEC, Math.min(limits.maxDurationSec, maxBySize));
}

/**
 * One forward pass over silence events (already chronological from FFmpeg).
 * Each silence is visited at most once → O(n) in silence count.
 *
 * Every encoded file is at most `maxChunkDuration` long, including overlap.
 * Unique audio is contiguous and covers [0, duration).
 */
export function planChunkWindows(
    duration: number,
    silences: SilenceSegment[],
    maxChunkDuration: number,
    overlap: number = OVERLAP_SEC,
): ChunkPlan[] {
    if (duration <= 0) return [];
    if (duration <= maxChunkDuration) {
        return [{ start: 0, end: duration, overlap: 0 }];
    }

    const plans: ChunkPlan[] = [];
    let uniqueStart = 0;
    let silenceIdx = 0;

    while (uniqueStart < duration - 1e-3) {
        const isFirst = plans.length === 0;
        const fileOverlap = isFirst ? 0 : Math.min(overlap, uniqueStart);
        const uniqueBudget = Math.max(MIN_UNIQUE_SEC, maxChunkDuration - fileOverlap);
        const windowEnd = Math.min(uniqueStart + uniqueBudget, duration);

        let splitAt = windowEnd;
        const earliest = uniqueStart + Math.min(MIN_UNIQUE_SEC, uniqueBudget * 0.25);

        while (silenceIdx < silences.length && silences[silenceIdx].end <= uniqueStart) {
            silenceIdx++;
        }

        let probe = silenceIdx;
        while (probe < silences.length && silences[probe].start <= windowEnd) {
            const mid = (silences[probe].start + silences[probe].end) / 2;
            if (mid >= earliest && mid <= windowEnd) {
                splitAt = mid;
            }
            probe++;
        }

        if (duration - splitAt < MIN_UNIQUE_SEC) {
            const tailFileStart = uniqueStart - fileOverlap;
            if (duration - tailFileStart <= maxChunkDuration) {
                splitAt = duration;
            }
        }

        const fileStart = uniqueStart - fileOverlap;
        if (splitAt - fileStart > maxChunkDuration) {
            splitAt = fileStart + maxChunkDuration;
        }
        if (splitAt <= uniqueStart) {
            splitAt = Math.min(uniqueStart + uniqueBudget, duration);
        }

        plans.push({
            start: fileStart,
            end: splitAt,
            overlap: fileOverlap,
        });

        uniqueStart = splitAt;
    }

    return plans;
}

function chunkFitsLimits(
    durationSec: number,
    fileBytes: number,
    limits: { maxDurationSec: number; maxBytes: number },
): boolean {
    return durationSec <= limits.maxDurationSec + DURATION_SLACK_SEC && fileBytes <= limits.maxBytes;
}

async function encodePlans(
    audioPath: string,
    tempDir: string,
    format: 'flac' | 'mp3',
    plans: ChunkPlan[],
): Promise<AudioChunk[]> {
    const configs = plans.map((plan, i) => ({
        start: plan.start,
        end: plan.end,
        outputPath: `${tempDir}/chunk_${i.toString().padStart(3, '0')}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${format}`,
    }));

    await window.electronAPI.splitAudio(audioPath, configs, format);

    return plans.map((plan, i) => ({
        index: i,
        startTime: plan.start,
        endTime: plan.end,
        filePath: configs[i].outputPath,
        overlap: plan.overlap,
    }));
}

/**
 * Measure each encoded file. Oversized chunks are split in half (still linear
 * overall: each second of audio is encoded a constant number of times).
 */
async function enforceChunkLimits(
    sourcePath: string,
    encoded: AudioChunk[],
    tempDir: string,
    format: 'flac' | 'mp3',
    limits: { maxDurationSec: number; maxBytes: number },
    depth = 0,
): Promise<AudioChunk[]> {
    const accepted: AudioChunk[] = [];

    for (const chunk of encoded) {
        const info = await window.electronAPI.getFileInfo(chunk.filePath);
        const duration = await window.electronAPI.getDuration(chunk.filePath);

        if (chunkFitsLimits(duration, info.size, limits)) {
            accepted.push({ ...chunk, index: accepted.length });
            continue;
        }

        const span = chunk.endTime - chunk.startTime;
        if (depth >= 8 || span <= MIN_UNIQUE_SEC) {
            console.warn(
                `[Chunks] ${chunk.filePath} still over limit ` +
                `(${(info.size / 1024 / 1024).toFixed(1)} MB, ${duration.toFixed(1)}s)`,
            );
            accepted.push({ ...chunk, index: accepted.length });
            continue;
        }

        const mid = (chunk.startTime + chunk.endTime) / 2;
        const secondStart = Math.max(chunk.startTime, mid - OVERLAP_SEC);
        const repaired = await encodePlans(sourcePath, tempDir, format, [
            { start: chunk.startTime, end: mid, overlap: chunk.overlap },
            { start: secondStart, end: chunk.endTime, overlap: mid - secondStart },
        ]);
        const nested = await enforceChunkLimits(
            sourcePath, repaired, tempDir, format, limits, depth + 1,
        );
        for (const piece of nested) {
            accepted.push({ ...piece, index: accepted.length });
        }
    }

    return accepted;
}

export async function createAudioChunks(
    audioPath: string,
    tempDir: string,
    format: 'flac' | 'mp3' = 'mp3',
    provider: AIProvider = 'gemini',
): Promise<{ chunks: AudioChunk[], silences: SilenceSegment[] }> {
    const limits = TRANSCRIBE_LIMITS[provider];
    const duration = await window.electronAPI.getDuration(audioPath);
    const fileInfo = await window.electronAPI.getFileInfo(audioPath);
    const maxChunkDuration = effectiveMaxChunkDuration(duration, fileInfo.size, limits);

    const silences: SilenceSegment[] = await window.electronAPI.detectSilences(
        audioPath,
        -25,
        0.3,
    );

    console.log(
        `[Chunks] ${provider}: ${duration.toFixed(1)}s, ` +
        `${(fileInfo.size / 1024 / 1024).toFixed(1)} MB → max ${maxChunkDuration.toFixed(0)}s ` +
        `(time cap ${limits.maxDurationSec}s, size cap ${(limits.maxBytes / 1024 / 1024).toFixed(0)} MB)`,
    );

    if (chunkFitsLimits(duration, fileInfo.size, limits)) {
        return {
            chunks: [{
                index: 0,
                startTime: 0,
                endTime: duration,
                filePath: audioPath,
                overlap: 0,
            }],
            silences,
        };
    }

    const plans = planChunkWindows(duration, silences, maxChunkDuration, OVERLAP_SEC);
    const encoded = await encodePlans(audioPath, tempDir, format, plans);
    const chunks = await enforceChunkLimits(
        audioPath, encoded, tempDir, format, limits,
    );

    console.log(`[Chunks] ${provider}: sending ${chunks.length} file(s)`);

    return { chunks, silences };
}
