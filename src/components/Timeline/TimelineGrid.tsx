import React from 'react';
import { useTimelineTicks } from './useTimelineTicks';
import './Timeline.css';

interface TimelineGridProps {
    zoomStart: number;
    zoomEnd: number;
}

export const TimelineGrid: React.FC<TimelineGridProps> = ({ zoomStart, zoomEnd }) => {
    const { majorTicks, minorTicks } = useTimelineTicks(zoomStart, zoomEnd);
    const viewDuration = zoomEnd - zoomStart;

    const getLeft = (time: number) => ((time - zoomStart) / viewDuration) * 100;

    return (
        <div className="timeline-grid">
            {majorTicks.map(tick => (
                <div
                    key={`major-${tick.time}`}
                    className="grid-line major"
                    style={{ left: `${getLeft(tick.time)}%` }}
                />
            ))}
            {minorTicks.map(time => (
                <div
                    key={`minor-${time}`}
                    className="grid-line minor"
                    style={{ left: `${getLeft(time)}%` }}
                />
            ))}
        </div>
    );
};
