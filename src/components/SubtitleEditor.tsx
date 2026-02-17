import { useState, useCallback, useRef, useEffect } from 'react';
import { formatSrtTime, parseSrtTime, generateId, detectDirection } from '../utils';
import type { Subtitle } from '../types';

interface SubtitleEditorProps {
    subtitles: Subtitle[];
    onSubtitlesChange: (subtitles: Subtitle[]) => void;
    currentTime: number;
    mediaDuration?: number; // Actual media file duration
    onSeek: (time: number) => void;
}

export function SubtitleEditor({ subtitles, onSubtitlesChange, currentTime, mediaDuration, onSeek }: SubtitleEditorProps) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [autoScroll, setAutoScroll] = useState(true);
    const activeRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (autoScroll && activeRef.current) {
            activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [autoScroll, currentTime]);

    const handleTextChange = useCallback((id: string, text: string) => {
        onSubtitlesChange(
            subtitles.map(sub => sub.id === id ? { ...sub, text } : sub)
        );
    }, [subtitles, onSubtitlesChange]);

    const handleTimeBlur = useCallback((id: string, field: 'startTime' | 'endTime', value: string) => {
        const seconds = parseSrtTime(value);
        onSubtitlesChange(
            subtitles.map(sub => sub.id === id ? { ...sub, [field]: seconds } : sub)
        );
    }, [subtitles, onSubtitlesChange]);

    const handleDelete = useCallback((id: string) => {
        onSubtitlesChange(
            subtitles.filter(sub => sub.id !== id).map((sub, i) => ({ ...sub, index: i + 1 }))
        );
    }, [subtitles, onSubtitlesChange]);

    const handleAdd = useCallback(() => {
        const lastSub = subtitles[subtitles.length - 1];
        const startTime = lastSub ? lastSub.endTime + 0.5 : 0;
        const newSub: Subtitle = {
            id: generateId(),
            index: subtitles.length + 1,
            startTime,
            endTime: startTime + 2,
            text: '',
        };
        onSubtitlesChange([...subtitles, newSub]);
        setEditingId(newSub.id);
    }, [subtitles, onSubtitlesChange]);

    const isActive = (sub: Subtitle) =>
        currentTime >= sub.startTime && currentTime <= sub.endTime;

    return (
        <div className="subtitle-editor">
            <div className="editor-header">
                <h2>Subtitles</h2>
                <div className="editor-header-actions">
                    <label className="auto-scroll-toggle" title="Auto-scroll to active subtitle">
                        <input
                            type="checkbox"
                            checked={autoScroll}
                            onChange={(e) => setAutoScroll(e.target.checked)}
                        />
                        <span className="icon icon-sm">swap_vert</span>
                        Auto-scroll
                    </label>
                    <span className="subtitle-count">{subtitles.length} entries</span>
                </div>
            </div>

            {subtitles.length === 0 ? (
                <div className="empty-state">
                    <p>No subtitles yet</p>
                    <p className="hint">To get started, click "Generate Subtitles" or Import Subtitles</p>
                </div>
            ) : (
                <div className="subtitle-list">
                    {subtitles.map((sub) => {
                        const isBeyondMedia = mediaDuration ? sub.startTime > mediaDuration : false;

                        return (
                            <div
                                key={sub.id}
                                ref={isActive(sub) ? activeRef : null}
                                className={`subtitle-entry ${isActive(sub) ? 'active' : ''} ${editingId === sub.id ? 'editing' : ''} ${isBeyondMedia ? 'beyond-media' : ''}`}
                                onClick={() => onSeek(sub.startTime)}
                                title={isBeyondMedia ? "This subtitle starts after the media ends" : ""}
                            >
                                <div className="subtitle-index">{sub.index}</div>

                                <div className="subtitle-times">
                                    <input
                                        key={`start-${sub.id}-${sub.startTime}`}
                                        type="text"
                                        className="time-input"
                                        defaultValue={formatSrtTime(sub.startTime)}
                                        onBlur={(e) => handleTimeBlur(sub.id, 'startTime', e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                    <span className="time-separator">→</span>
                                    <input
                                        key={`end-${sub.id}-${sub.endTime}`}
                                        type="text"
                                        className="time-input"
                                        defaultValue={formatSrtTime(sub.endTime)}
                                        onBlur={(e) => handleTimeBlur(sub.id, 'endTime', e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                </div>

                                <textarea
                                    className="subtitle-text"
                                    dir={detectDirection(sub.text)}
                                    value={sub.text}
                                    onChange={(e) => handleTextChange(sub.id, e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    onFocus={() => setEditingId(sub.id)}
                                    onBlur={() => setEditingId(null)}
                                    rows={2}
                                    placeholder="Enter subtitle text..."
                                />

                                <button
                                    className="delete-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete(sub.id);
                                    }}
                                    title="Delete subtitle"
                                >
                                    <span className="icon icon-sm">close</span>
                                </button>
                            </div>
                        )
                    })}
                </div>
            )}

            <button className="add-subtitle-btn" onClick={handleAdd}>
                <span className="icon icon-sm">add</span> Add New Line
            </button>
        </div>
    );
}

// Wrap subtitle text to max 8 words per line for tooltip
function wrapTooltip(text: string): string {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    for (let i = 0; i < words.length; i += 8) {
        lines.push(words.slice(i, i + 8).join(' '));
    }
    return lines.join('\n');
}

// Mini timeline preview component
export function TimelinePreview({ subtitles, duration, currentTime, onSeek, mediaDuration }: {
    subtitles: Subtitle[];
    duration: number; // Max duration
    currentTime: number;
    onSeek: (time: number) => void;
    mediaDuration?: number; // Actual media duration
}) {
    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = x / rect.width;
        onSeek(percent * duration);
    };

    return (
        <div className="timeline-preview" onClick={handleClick}>
            {/* Media duration background indicator */}
            {mediaDuration && duration > mediaDuration && (
                <div
                    className="timeline-media-zone"
                    style={{
                        width: `${(mediaDuration / duration) * 100}%`,
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        borderRight: '1px dashed var(--color-warning)',
                        pointerEvents: 'none'
                    }}
                    title="Media Duration"
                />
            )}

            <div className="timeline-subtitles">
                {subtitles.map((sub) => (
                    <div
                        key={sub.id}
                        className={`timeline-segment ${mediaDuration && sub.startTime > mediaDuration ? 'beyond-media' : ''}`}
                        title={wrapTooltip(sub.text)}
                        style={{
                            left: `${(sub.startTime / duration) * 100}%`,
                            width: `${((sub.endTime - sub.startTime) / duration) * 100}%`,
                        }}
                    />
                ))}
            </div>
            <div
                className="timeline-cursor"
                style={{ left: `${(currentTime / duration) * 100}%` }}
            />
        </div>
    );
}
