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
}

export const Timeline: React.FC<TimelineProps> = ({
    subtitles,
    currentTime,
    duration,
    mediaDuration,
    onSeek
}) => {
    // Zoom state
    const [zoomStart, setZoomStart] = useState(0);
    const [zoomEnd, setZoomEnd] = useState(duration || 100);

    // Reset zoom when duration changes (e.g. new file)
    useEffect(() => {
        if (duration > 0) {
            setZoomStart(0);
            setZoomEnd(duration);
        }
    }, [duration]);

    // Ensure we don't have invalid state if duration updates
    // e.g. if duration shrinks, clamp end
    // But effect above handles reset. 
    // Maybe we want to preserve relative zoom? No, reset is safer for now.

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
            <MainTrack
                subtitles={subtitles}
                currentTime={currentTime}
                zoomStart={zoomStart}
                zoomEnd={effectiveZoomEnd}
                onSeek={onSeek}
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
            <div className="timeline-info-row" style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '11px',
                color: 'var(--color-text-muted)',
                padding: '0 4px'
            }}>
                <span>{formatTime(zoomStart)}</span>
                <span>Zoomed View</span>
                <span>{formatTime(effectiveZoomEnd)}</span>
            </div>
        </div>
    );
};

function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}
