import { useState, useCallback } from 'react';
import { formatSrtTime, parseSrtTime, generateId, formatDisplayTime, detectDirection } from '../utils';
import type { Subtitle } from '../types';

interface SubtitleEditorProps {
    subtitles: Subtitle[];
    onSubtitlesChange: (subtitles: Subtitle[]) => void;
    currentTime: number;
    onSeek: (time: number) => void;
}

export function SubtitleEditor({ subtitles, onSubtitlesChange, currentTime, onSeek }: SubtitleEditorProps) {
    const [editingId, setEditingId] = useState<string | null>(null);

    const handleTextChange = useCallback((id: string, text: string) => {
        onSubtitlesChange(
            subtitles.map(sub => sub.id === id ? { ...sub, text } : sub)
        );
    }, [subtitles, onSubtitlesChange]);

    const handleTimeChange = useCallback((id: string, field: 'startTime' | 'endTime', value: string) => {
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
                <span className="subtitle-count">{subtitles.length} entries</span>
            </div>

            {subtitles.length === 0 ? (
                <div className="empty-state">
                    <p>No subtitles yet</p>
                    <p className="hint">Upload a file and click "Generate Subtitles" to get started</p>
                </div>
            ) : (
                <div className="subtitle-list">
                    {subtitles.map((sub) => (
                        <div
                            key={sub.id}
                            className={`subtitle-entry ${isActive(sub) ? 'active' : ''} ${editingId === sub.id ? 'editing' : ''}`}
                            onClick={() => onSeek(sub.startTime)}
                        >
                            <div className="subtitle-index">{sub.index}</div>

                            <div className="subtitle-times">
                                <input
                                    type="text"
                                    className="time-input"
                                    value={formatSrtTime(sub.startTime)}
                                    onChange={(e) => handleTimeChange(sub.id, 'startTime', e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                />
                                <span className="time-separator">→</span>
                                <input
                                    type="text"
                                    className="time-input"
                                    value={formatSrtTime(sub.endTime)}
                                    onChange={(e) => handleTimeChange(sub.id, 'endTime', e.target.value)}
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
                    ))}
                </div>
            )}

            <button className="add-subtitle-btn" onClick={handleAdd}>
                <span className="icon icon-sm">add</span> Add Subtitle
            </button>
        </div>
    );
}

// Mini timeline preview component
export function TimelinePreview({ subtitles, duration, currentTime, onSeek }: {
    subtitles: Subtitle[];
    duration: number;
    currentTime: number;
    onSeek: (time: number) => void;
}) {
    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = x / rect.width;
        onSeek(percent * duration);
    };

    return (
        <div className="timeline-preview" onClick={handleClick}>
            <div className="timeline-subtitles">
                {subtitles.map((sub) => (
                    <div
                        key={sub.id}
                        className="timeline-segment"
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
            <div className="timeline-times">
                <span>{formatDisplayTime(currentTime)}</span>
                <span>{formatDisplayTime(duration)}</span>
            </div>
        </div>
    );
}
