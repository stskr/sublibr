import { useMemo } from 'react';

export interface Tick {
    time: number;
    label: string;
    isMajor: boolean;
}

export function useTimelineTicks(zoomStart: number, zoomEnd: number, widthPixels = 1000) {
    return useMemo(() => {
        const viewDuration = zoomEnd - zoomStart;
        if (viewDuration <= 0) return { majorTicks: [], minorTicks: [] };

        // Target pixels per major tick
        const targetPixelsPerTick = 100;
        const targetTickCount = widthPixels / targetPixelsPerTick;
        const idealInterval = viewDuration / targetTickCount;

        // Available intervals
        const intervals = [
            0.1, 0.2, 0.5,
            1, 2, 5, 10, 15, 30,
            60, 120, 300, 600, 900, 1800,
            3600
        ];

        // Find best fit interval
        let majorInterval = intervals.find(i => i >= idealInterval) || intervals[intervals.length - 1];

        // Decide minor ticks (subdivisions)
        let minorDivisions = 4; // Default to 4 (e.g. 1s -> 0.25s)
        if (majorInterval === 1) minorDivisions = 5; // 0.2s
        if (majorInterval === 10) minorDivisions = 10; // 1s
        if (majorInterval === 60) minorDivisions = 6; // 10s

        const minorInterval = majorInterval / minorDivisions;

        const majorTicks: Tick[] = [];
        const minorTicks: number[] = [];

        // Align start to interval
        const startTick = Math.floor(zoomStart / minorInterval) * minorInterval;

        for (let t = startTick; t <= zoomEnd; t += minorInterval) {
            if (t < zoomStart) continue;

            // Check if major (close enough to multiple of majorInterval)
            // Use epsilon for float precision
            const isMajor = Math.abs((t / majorInterval) - Math.round(t / majorInterval)) < 0.0001;

            if (isMajor) {
                majorTicks.push({
                    time: t,
                    label: formatTick(t),
                    isMajor: true
                });
            } else {
                minorTicks.push(t);
            }
        }

        return { majorTicks, minorTicks };
    }, [zoomStart, zoomEnd, widthPixels]);
}

function formatTick(time: number): string {
    const h = Math.floor(time / 3600);
    const m = Math.floor((time % 3600) / 60);
    const s = Math.floor(time % 60);

    // For sub-second precision if zoomed way in, we could add decimals
    // But keeping it simple for now

    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
}
