import React, { useState, useEffect, useCallback } from 'react';
import type { Subtitle } from '../../types';
import { MainTrack } from './MainTrack';
import { Minimap } from './Minimap';
import './Timeline.css';

interface TimelineProps {
    subtitles: Subtitle[];
    currentTime: number;
    duration: number; // Max duration to display
    mediaDuration?: number; // Actual media duration
    onSeek: (time: number) => void;
    onSplitSubtitle: (id: string, time: number) => void;
    onTrimSubtitle: (id: string, startTime: number, endTime: number) => void;
    activeTool: TimelineTool;
}

export type TimelineTool = 'select' | 'scissors' | 'trim';

export const Timeline: React.FC<TimelineProps> = ({
    subtitles,
    currentTime,
    duration,
    mediaDuration,
    onSeek,
    onSplitSubtitle,
    onTrimSubtitle,
    activeTool
}) => {
    // Zoom state
    const [zoomStart, setZoomStart] = useState(0);
    const [zoomEnd, setZoomEnd] = useState(duration || 100);

    // Reset zoom when duration changes (e.g. new file)
    useEffect(() => {
        if (duration > 0) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setZoomStart(0);
            setZoomEnd(duration);
        }
    }, [duration]);

    const handleZoomChange = useCallback((start: number, end: number) => {
        setZoomStart(Math.max(0, start));
        setZoomEnd(Math.min(duration, end));
    }, [duration]);

    // If no duration yet, render nothing or placeholder?
    if (!duration) return null;

    // Safety check for viewDuration to avoid divide by zero in MainTrack
    const effectiveZoomEnd = Math.max(zoomEnd, zoomStart + 0.1);

    return (
        <div className="timeline-container">
            <div className="timeline-tracks">
                <MainTrack
                    subtitles={subtitles}
                    currentTime={currentTime}
                    zoomStart={zoomStart}
                    zoomEnd={effectiveZoomEnd}
                    onSeek={onSeek}
                    activeTool={activeTool}
                    onSplitSubtitle={onSplitSubtitle}
                    onTrimSubtitle={onTrimSubtitle}
                />
                <Minimap
                    subtitles={subtitles}
                    currentTime={currentTime}
                    duration={duration}
                    mediaDuration={mediaDuration}
                    zoomStart={zoomStart}
                    zoomEnd={effectiveZoomEnd}
                    onZoomChange={handleZoomChange}
                    onSeek={onSeek}
                />
            </div>
        </div>
    );
};


