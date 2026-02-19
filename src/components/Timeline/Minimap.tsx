import React, { useRef, useState, useEffect } from 'react';
import type { Subtitle } from '../../types';
import './Timeline.css';

interface MinimapProps {
    subtitles: Subtitle[];
    currentTime: number;
    duration: number; // Total duration of the timeline (max of media or subtitles)
    mediaDuration?: number; // Actual media file duration
    zoomStart: number;
    zoomEnd: number;
    onZoomChange: (start: number, end: number) => void;
    onSeek: (time: number) => void;
}

export const Minimap: React.FC<MinimapProps> = ({
    subtitles,
    currentTime,
    duration,
    mediaDuration,
    zoomStart,
    zoomEnd,
    onZoomChange,
    onSeek
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [dragging, setDragging] = useState<'left' | 'right' | 'window' | null>(null);
    const dragStartX = useRef<number>(0);
    const initialZoom = useRef<{ start: number; end: number }>({ start: 0, end: 0 });

    // Minimum zoom window size (e.g., 5 seconds or 1% of duration)
    const MIN_ZOOM_DURATION = Math.max(5, duration * 0.01);

    const getTimeFromX = (x: number) => {
        if (!containerRef.current) return 0;
        const rect = containerRef.current.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
        return percent * duration;
    };

    const handleMouseDown = (e: React.MouseEvent, type: 'left' | 'right' | 'window') => {
        e.stopPropagation();
        e.preventDefault();
        setDragging(type);
        dragStartX.current = e.clientX;
        initialZoom.current = { start: zoomStart, end: zoomEnd };
    };

    const handleTrackClick = (e: React.MouseEvent) => {
        if (dragging) return;
        const time = getTimeFromX(e.clientX);
        onSeek(time);

        // Optional: Center view on click if outside current view?
        if (time < zoomStart || time > zoomEnd) {
            const windowSize = zoomEnd - zoomStart;
            let newStart = time - (windowSize / 2);
            let newEnd = newStart + windowSize;

            if (newStart < 0) {
                newStart = 0;
                newEnd = windowSize;
            } else if (newEnd > duration) {
                newEnd = duration;
                newStart = duration - windowSize;
            }
            onZoomChange(newStart, newEnd);
        }
    };

    useEffect(() => {
        if (!dragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!containerRef.current) return;

            const rect = containerRef.current.getBoundingClientRect();
            const deltaPixels = e.clientX - dragStartX.current;
            const deltaSeconds = (deltaPixels / rect.width) * duration;

            let newStart = initialZoom.current.start;
            let newEnd = initialZoom.current.end;

            if (dragging === 'window') {
                const span = newEnd - newStart;
                newStart += deltaSeconds;
                newEnd += deltaSeconds;

                // Clamp to bounds
                if (newStart < 0) {
                    newStart = 0;
                    newEnd = span;
                } else if (newEnd > duration) {
                    newEnd = duration;
                    newStart = duration - span;
                }
            } else if (dragging === 'left') {
                newStart += deltaSeconds;
                // Clamp
                if (newStart < 0) newStart = 0;
                if (newStart > newEnd - MIN_ZOOM_DURATION) newStart = newEnd - MIN_ZOOM_DURATION;
            } else if (dragging === 'right') {
                newEnd += deltaSeconds;
                // Clamp
                if (newEnd > duration) newEnd = duration;
                if (newEnd < newStart + MIN_ZOOM_DURATION) newEnd = newStart + MIN_ZOOM_DURATION;
            }

            onZoomChange(newStart, newEnd);
        };

        const handleMouseUp = () => {
            setDragging(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragging, duration, MIN_ZOOM_DURATION, onZoomChange]);

    const getPercent = (time: number) => {
        if (duration === 0) return 0;
        return (time / duration) * 100;
    };

    const startPercent = getPercent(zoomStart);
    const endPercent = getPercent(zoomEnd);
    const widthPercent = endPercent - startPercent;

    return (
        <div
            className="timeline-minimap"
            ref={containerRef}
            onMouseDown={handleTrackClick}
        >
            {/* Background Track Segments */}
            <div className="timeline-minimap-track-bg">
                {subtitles.map(sub => (
                    <div
                        key={sub.id}
                        className="timeline-minimap-segment"
                        style={{
                            left: `${getPercent(sub.startTime)}%`,
                            width: `${Math.max(0.2, getPercent(sub.endTime - sub.startTime))}%`
                        }}
                    />
                ))}
            </div>

            {/* Media Limit Line */}
            {mediaDuration && mediaDuration < duration && (
                <div
                    className="timeline-media-limit"
                    style={{ left: `${getPercent(mediaDuration)}%` }}
                />
            )}

            {/* Playhead */}
            <div
                className="timeline-minimap-playhead"
                style={{ left: `${getPercent(currentTime)}%` }}
            />

            {/* Overlays for unselected area */}
            <div
                className="timeline-minimap-overlay left"
                style={{ width: `${startPercent}%` }}
            />
            <div
                className="timeline-minimap-overlay right"
                style={{ left: `${endPercent}%`, right: 0 }}
            />

            {/* Visible Window & Handles */}
            <div
                className="timeline-window"
                style={{ left: `${startPercent}%`, width: `${widthPercent}%` }}
                onMouseDown={(e) => handleMouseDown(e, 'window')}
            >
                <div
                    className="timeline-handle left"
                    onMouseDown={(e) => handleMouseDown(e, 'left')}
                    title="Drag Start"
                />
                <div
                    className="timeline-handle right"
                    onMouseDown={(e) => handleMouseDown(e, 'right')}
                    title="Drag End"
                />
            </div>
        </div>
    );
};
