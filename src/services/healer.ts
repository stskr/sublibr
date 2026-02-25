import type { Subtitle, SilenceSegment, AIProvider, TokenUsage, ScreenSize } from '../types';
import { transcribeChunk } from './transcriber';

// Interface for a gap that needs healing
interface Gap {
    start: number;
    end: number;
    duration: number;
}

/**
 * Identify gaps in subtitles that are not covered by known silences
 * and attempt to fill them by re-transcribing those specific segments.
 */
export interface HealResult {
    subtitles: Subtitle[];
    tokenUsages: TokenUsage[];
}

export async function healSubtitles(
    subtitles: Subtitle[],
    audioPath: string,
    silences: SilenceSegment[],
    provider: AIProvider,
    apiKey: string,
    model: string,
    language: string,
    autoDetect: boolean,
    screenSize: ScreenSize = 'wide',
    /** Return true to abort healing early and return what we have so far */
    shouldSkip?: () => boolean,
    /** Called with (completedGaps, totalGaps) after each gap is processed */
    onProgress?: (completed: number, total: number) => void,
): Promise<HealResult> {
    if (subtitles.length === 0) return { subtitles, tokenUsages: [] };

    const MIN_GAP_DURATION = 2.0; // Minimum gap to consider for healing (seconds)
    const SILENCE_PADDING = 0.5; // Padding around silence to consider it "covering" a gap

    // 1. Identify Gaps
    const gaps: Gap[] = [];
    const sortedSubs = [...subtitles].sort((a, b) => a.startTime - b.startTime);

    // Initial check: Gap before first subtitle?
    // (Optional: maybe the intro is silent, we skip this for now unless it's huge)

    // Check gaps between subtitles
    for (let i = 0; i < sortedSubs.length - 1; i++) {
        const current = sortedSubs[i];
        const next = sortedSubs[i + 1];
        const gapDuration = next.startTime - current.endTime;

        if (gapDuration >= MIN_GAP_DURATION) {
            gaps.push({
                start: current.endTime,
                end: next.startTime,
                duration: gapDuration
            });
        }
    }

    // 2. Filter gaps that are actually silences
    const actionableGaps: Gap[] = [];

    for (const gap of gaps) {
        // Check if this gap is covered by a known silence
        // We consider it "covered" if there's a silence that overlaps significantly with it
        const isSilent = silences.some(silence => {
            const intersectionStart = Math.max(gap.start, silence.start - SILENCE_PADDING);
            const intersectionEnd = Math.min(gap.end, silence.end + SILENCE_PADDING);
            const intersectionDuration = Math.max(0, intersectionEnd - intersectionStart);

            // If silence covers > 80% of the gap, we ignore it
            return intersectionDuration / gap.duration > 0.8;
        });

        if (!isSilent) {
            actionableGaps.push(gap);
        }
    }

    if (actionableGaps.length === 0) {
        return { subtitles, tokenUsages: [] };
    }

    // 3. Heal gaps
    const newSubtitles: Subtitle[] = [];
    const tokenUsages: TokenUsage[] = [];
    const totalGaps = actionableGaps.length;

    for (let i = 0; i < actionableGaps.length; i++) {
        // Check for skip signal before starting each gap
        if (shouldSkip?.()) {
            console.log(`[Healing] Skipped after ${i}/${totalGaps} gaps`);
            break;
        }

        const gap = actionableGaps[i];

        // Create a temporary "chunk" for this gap
        // We add a bit of buffer to context
        const chunkStart = Math.max(0, gap.start - 0.5);
        const chunkEnd = gap.end + 0.5;

        try {
            // Determine format based on provider
            const audioFormat = provider === 'openai' ? 'mp3' : 'flac';

            // Extract this specific audio segment to a temp file
            const tempDir = await window.electronAPI.getTempPath();
            const chunkPath = `${tempDir}/gap_heal_${Date.now()}_${i}.${audioFormat}`;

            // Use splitAudio to extract a single chunk
            await window.electronAPI.splitAudio(audioPath, [{
                start: chunkStart,
                end: chunkEnd,
                outputPath: chunkPath
            }], audioFormat);

            // Transcribe it with HIGH sensitivity mode?
            // We just use standard transcribe but maybe prompt could be tweaked?
            // For now, reuse standard transcribeChunk logic but we assume it's a small clip

            // We need to construct a pseudo AudioChunk object
            const tempChunk = {
                index: -1,
                startTime: chunkStart, // This is key: transcribeChunk uses this to offset timestamps!
                endTime: chunkEnd,
                filePath: chunkPath,
                overlap: 0
            };

            const result = await transcribeChunk(
                tempChunk,
                provider,
                apiKey,
                model,
                language,
                autoDetect,
                'healing', // Use healing-specific prompt
                undefined,
                screenSize
            );

            if (result.subtitles.length > 0) {
                // Add found subtitles
                newSubtitles.push(...result.subtitles);
            }
            tokenUsages.push(result.tokenUsage);

            // Cleanup temp file? (OS usually handles temp, but good practice if API exists)
            // await window.electronAPI.deleteFile(chunkPath);

        } catch (err) {
            console.error(`Failed to heal gap at ${gap.start}:`, err);
        }

        onProgress?.(i + 1, totalGaps);
    }

    // 4. Merge new subtitles with existing ones
    // We can reuse the "mergeSubtitles" logic but that's designed for sequential chunks.
    // Here we have random insertions.
    // Simple merge: add all, sort, resolve overlaps.

    // We just append and sort, then run a cleanup pass similar to mergeSubtitles' final step
    const finalPool = [...subtitles, ...newSubtitles].sort((a, b) => a.startTime - b.startTime);

    // Simple dedupe/overlap fix (simplified version of mergeSubtitles final pass)
    const merged: Subtitle[] = [];
    if (finalPool.length > 0) merged.push(finalPool[0]);

    for (let i = 1; i < finalPool.length; i++) {
        const current = finalPool[i];
        const prev = merged[merged.length - 1];

        // If overlap
        if (current.startTime < prev.endTime) {
            // If current is completely inside prev, ignore current (prev is likely the original valid one)
            if (current.endTime <= prev.endTime) {
                continue;
            }
            // If partial overlap, strict cut prev
            prev.endTime = current.startTime - 0.05;
        }

        // Enforce gap
        if (current.startTime <= prev.endTime) {
            prev.endTime = current.startTime - 0.01;
        }

        if (prev.endTime > prev.startTime) {
            merged.push(current);
        } else {
            // If we trimmed prev to death, replace it with current?
            // Or just drop prev? 
            // Logic: keep the one that seems more substantial?
            // For now, simple logic: current wins if it forces prev to <= 0
            if (merged.length > 0) merged.pop();
            merged.push(current);
        }
    }

    return {
        subtitles: merged.map((s, i) => ({ ...s, index: i + 1 })),
        tokenUsages,
    };
}
