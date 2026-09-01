import { describe, it, expect } from 'vitest';
import {
    effectiveMaxChunkDuration,
    planChunkWindows,
} from '../src/services/audioProcessor';
import { TRANSCRIBE_LIMITS } from '../src/services/providers';
import type { SilenceSegment } from '../src/types';

function uniqueCoverage(plans: { start: number; end: number; overlap: number }[]): [number, number][] {
    return plans.map((p, i) => [i === 0 ? p.start : p.start + p.overlap, p.end]);
}

function assertCovers(plans: { start: number; end: number; overlap: number }[], duration: number) {
    const ranges = uniqueCoverage(plans);
    expect(ranges[0][0]).toBeCloseTo(0, 5);
    expect(ranges[ranges.length - 1][1]).toBeCloseTo(duration, 5);
    for (let i = 1; i < ranges.length; i++) {
        expect(ranges[i][0]).toBeCloseTo(ranges[i - 1][1], 5);
    }
}

describe('effectiveMaxChunkDuration', () => {
    it('is capped by the model time limit when bitrate is low', () => {
        const gemini = TRANSCRIBE_LIMITS.gemini;
        const duration = 10 * 60;
        const bytes = 1 * 1024 * 1024;
        expect(effectiveMaxChunkDuration(duration, bytes, gemini)).toBe(gemini.maxDurationSec);
    });

    it('tightens the window when bitrate would blow the size cap', () => {
        const openai = TRANSCRIBE_LIMITS.openai;
        const duration = 60 * 60;
        const bytes = 80 * 1024 * 1024;
        const max = effectiveMaxChunkDuration(duration, bytes, openai);
        expect(max).toBeLessThan(openai.maxDurationSec);
        const estimatedChunkBytes = (bytes / duration) * max;
        expect(estimatedChunkBytes).toBeLessThanOrEqual(openai.maxBytes);
    });
});

describe('planChunkWindows', () => {
    it('returns a single window when the file is under the cap', () => {
        const plans = planChunkWindows(60, [], 28 * 60);
        expect(plans).toEqual([{ start: 0, end: 60, overlap: 0 }]);
    });

    it('hard-splits at the cap when there are no silences', () => {
        const max = 100;
        const duration = 250;
        const plans = planChunkWindows(duration, [], max, 10);
        assertCovers(plans, duration);
        for (const p of plans) {
            expect(p.end - p.start).toBeLessThanOrEqual(max);
        }
    });

    it('prefers the last silence inside each window (O(n) forward scan)', () => {
        const silences: SilenceSegment[] = [
            { start: 90, end: 92 },
            { start: 95, end: 97 },
            { start: 190, end: 193 },
        ];
        const plans = planChunkWindows(200, silences, 100, 10);
        expect(plans[0].end).toBeCloseTo(96, 5);
        assertCovers(plans, 200);
        for (const p of plans) {
            expect(p.end - p.start).toBeLessThanOrEqual(100);
        }
    });

    it('never lets overlap push a file past maxChunkDuration', () => {
        const duration = 500;
        const plans = planChunkWindows(duration, [], 100, 10);
        for (const p of plans) {
            expect(p.end - p.start).toBeLessThanOrEqual(100);
        }
        assertCovers(plans, duration);
    });

    it('visits each silence at most once (monotonic pointer)', () => {
        const silences: SilenceSegment[] = Array.from({ length: 200 }, (_, i) => ({
            start: i * 10 + 5,
            end: i * 10 + 6,
        }));
        const plans = planChunkWindows(2000, silences, 120, 10);
        assertCovers(plans, 2000);
        expect(plans.length).toBeGreaterThan(1);
        for (const p of plans) {
            expect(p.end - p.start).toBeLessThanOrEqual(120);
        }
    });
});
