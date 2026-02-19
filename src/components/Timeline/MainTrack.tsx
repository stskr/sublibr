import React, { useRef, useState } from 'react';
import type { Subtitle } from '../../types';
import { Ruler } from './Ruler';
import { TimelineGrid } from './TimelineGrid';
import type { TimelineTool } from './Timeline';
import { formatVttTime, detectDirection } from '../../utils';
import './Timeline.css';

interface MainTrackProps {
    subtitles: Subtitle[];
    currentTime: number;
    zoomStart: number;
    zoomEnd: number;
    onSeek: (time: number) => void;
    activeTool: TimelineTool;
    onSplitSubtitle: (id: string, splitTime: number) => void;
    onTrimSubtitle: (id: string, startTime: number, endTime: number) => void;
}

export const MainTrack: React.FC<MainTrackProps> = ({
    subtitles,
    currentTime,
    zoomStart,
    zoomEnd,
    onSeek,
    activeTool,
    onSplitSubtitle,
    onTrimSubtitle
}) => {
    const trackRef = useRef<HTMLDivElement>(null);
    const viewDuration = zoomEnd - zoomStart;

    const [isDragging, setIsDragging] = useState<{ id: string, side: 'start' | 'end' } | null>(null);
    const [hoverTime, setHoverTime] = useState<number | null>(null);

    const getTimeFromX = (clientX: number) => {
        if (!trackRef.current) return 0;
        const rect = trackRef.current.getBoundingClientRect();
        const x = clientX - rect.left;
        const percent = x / rect.width;
        return zoomStart + (percent * viewDuration);
    };

    const handleTrackClick = (e: React.MouseEvent) => {
        if (activeTool === 'scissors') {
            const time = getTimeFromX(e.clientX);
            const activeSub = subtitles.find(s => time >= s.startTime && time <= s.endTime);
            if (activeSub) {
                onSplitSubtitle(activeSub.id, time);
                return;
            }
        }

        // Default seek behavior if not splitting OR if click was outside a subtitle
        const time = getTimeFromX(e.clientX);
        onSeek(Math.max(0, time));
    };

    const handleMouseDown = (e: React.MouseEvent, id: string, side: 'start' | 'end') => {
        if (activeTool !== 'trim') return;
        e.stopPropagation();
        setIsDragging({ id, side });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        const time = getTimeFromX(e.clientX);
        setHoverTime(time);

        if (!isDragging) return;
        const sub = subtitles.find(s => s.id === isDragging.id);
        if (!sub) return;

        if (isDragging.side === 'start') {
            onTrimSubtitle(sub.id, Math.min(time, sub.endTime - 0.1), sub.endTime);
        } else {
            onTrimSubtitle(sub.id, sub.startTime, Math.max(time, sub.startTime + 0.1));
        }
    };

    const handleMouseUp = () => {
        setIsDragging(null);
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
            className={`timeline-main-track tool-${activeTool}`}
            ref={trackRef}
            onClick={handleTrackClick}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => {
                handleMouseUp();
                setHoverTime(null);
            }}
        >
            <Ruler zoomStart={zoomStart} zoomEnd={zoomEnd} />

            <div className="timeline-subtitles-container">
                <TimelineGrid zoomStart={zoomStart} zoomEnd={zoomEnd} />

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
                        >
                            <div className="timeline-segment-content">
                                {/* Text removed as per request */}
                            </div>
                            {activeTool === 'trim' && (
                                <>
                                    <div
                                        className="trim-handle start"
                                        onMouseDown={(e) => handleMouseDown(e, sub.id, 'start')}
                                    />
                                    <div
                                        className="trim-handle end"
                                        onMouseDown={(e) => handleMouseDown(e, sub.id, 'end')}
                                    />
                                </>
                            )}
                        </div>
                    );
                })}

                {/* Playhead */}
                {currentTime >= zoomStart && currentTime <= zoomEnd && (
                    <div
                        className="timeline-main-cursor"
                        style={{ left: `${getPosition(currentTime)}%` }}
                    />
                )}
            </div>

            <div
                className="timeline-main-ghost-cursor"
                style={{
                    left: hoverTime !== null ? `${getPosition(hoverTime)}%` : undefined,
                    display: hoverTime !== null ? 'block' : 'none'
                }}
            >
                {hoverTime !== null && (
                    <>
                        {(() => {
                            const sub = subtitles.find(s => hoverTime >= s.startTime && hoverTime <= s.endTime);
                            if (!sub) return null;
                            const dir = detectDirection(sub.text);
                            return (
                                <div
                                    className="timeline-hover-subtitle"
                                    dir={dir}
                                    style={{
                                        direction: dir,
                                        transform: getPosition(hoverTime) < 15 ? 'translateX(0)' : getPosition(hoverTime) > 85 ? 'translateX(-100%)' : 'translateX(-50%)'
                                    }}
                                >
                                    {sub.text}
                                </div>
                            );
                        })()}
                        <div
                            className="timeline-hover-timecode"
                            style={{
                                transform: getPosition(hoverTime) < 10 ? 'translateX(0)' : getPosition(hoverTime) > 90 ? 'translateX(-100%)' : 'translateX(-50%)'
                            }}
                        >
                            {formatVttTime(hoverTime)}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
