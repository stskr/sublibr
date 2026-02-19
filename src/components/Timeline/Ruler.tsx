import React from 'react';
import { useTimelineTicks } from './useTimelineTicks';
import './Timeline.css';

interface RulerProps {
    zoomStart: number;
    zoomEnd: number;
}

export const Ruler: React.FC<RulerProps> = ({ zoomStart, zoomEnd }) => {
    const { majorTicks, minorTicks } = useTimelineTicks(zoomStart, zoomEnd);
    const viewDuration = zoomEnd - zoomStart;

    const getLeft = (time: number) => ((time - zoomStart) / viewDuration) * 100;

    return (
        <div className="timeline-ruler">
            {majorTicks.map(tick => (
                <div
                    key={`major-${tick.time}`}
                    className="ruler-tick major"
                    style={{ left: `${getLeft(tick.time)}%` }}
                >
                    <span className="ruler-label">{tick.label}</span>
                </div>
            ))}
            {minorTicks.map(time => (
                <div
                    key={`minor-${time}`}
                    className="ruler-tick minor"
                    style={{ left: `${getLeft(time)}%` }}
                />
            ))}
        </div>
    );
};
