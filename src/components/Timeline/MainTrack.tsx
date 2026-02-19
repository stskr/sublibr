import React, { useRef } from 'react';
import type { Subtitle } from '../../types';
import './Timeline.css';

interface MainTrackProps {
    subtitles: Subtitle[];
    currentTime: number;
    zoomStart: number;
    zoomEnd: number;
    onSeek: (time: number) => void;
}

export const MainTrack: React.FC<MainTrackProps> = ({
    subtitles,
    currentTime,
    zoomStart,
    zoomEnd,
    onSeek
}) => {
    const trackRef = useRef<HTMLDivElement>(null);
    const viewDuration = zoomEnd - zoomStart;

    const handleTrackClick = (e: React.MouseEvent) => {
        if (!trackRef.current) return;
        const rect = trackRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = x / rect.width;
        const time = zoomStart + (percent * viewDuration);
        onSeek(Math.max(0, time));
    };

    // Filter subtitles to only render visible ones (plus a buffer)
    const renderSubtitles = subtitles.filter(sub =>
        sub.endTime > zoomStart && sub.startTime < zoomEnd
    );

    const getPosition = (time: number) => {
        return ((time - zoomStart) / viewDuration) * 100;
    };

    return (
        <div
            className="timeline-main-track"
            ref={trackRef}
            onClick={handleTrackClick}
        >
            {renderSubtitles.map(sub => {
                const left = getPosition(sub.startTime);
                const width = getPosition(sub.endTime) - left;

                return (
                    <div
                        key={sub.id}
                        className="timeline-main-segment"
                        style={{
                            left: `${left}%`,
                            width: `${Math.max(0.2, width)}%`
                        }}
                        title={sub.text}
                    />
                );
            })}

            {/* Playhead */}
            {currentTime >= zoomStart && currentTime <= zoomEnd && (
                <div
                    className="timeline-main-cursor"
                    style={{ left: `${getPosition(currentTime)}%` }}
                />
            )}

            {/* Ghost Cursor (Optional, JS based or CSS based using :hover and css vars? CSS alone can't know time) */}
            <div className="timeline-main-ghost-cursor" />
        </div>
    );
};
