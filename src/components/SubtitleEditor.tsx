import { Fragment, useState, useCallback, useRef, useEffect } from 'react';
import { formatSrtTime, parseSrtTime, generateId, detectDirection } from '../utils';
import { StyledText } from './common/StyledText';
import { RichTextEditor } from './common/RichTextEditor';
import { EditorHeader } from './common/EditorHeader';
import type { RichTextEditorRef } from './common/RichTextEditor';
import type { Subtitle } from '../types';

/** Shortest cue that can be inserted between two existing lines without moving them. */
const MIN_INSERT_DURATION = 0.1;
const TIME_NUDGE_SEC = 0.1;
const TIME_NUDGE_SHIFT_SEC = 1;

function roundMs(seconds: number): number {
    return Math.round(Math.max(0, seconds) * 1000) / 1000;
}

function TimeInput({
    seconds,
    onCommit,
    min = 0,
    max,
    ariaLabel,
}: {
    seconds: number;
    onCommit: (seconds: number) => void;
    min?: number;
    max?: number;
    ariaLabel: string;
}) {
    const [text, setText] = useState(formatSrtTime(seconds));
    const focusedRef = useRef(false);

    useEffect(() => {
        if (!focusedRef.current) setText(formatSrtTime(seconds));
    }, [seconds]);

    const clamp = (value: number) => {
        let next = roundMs(value);
        if (min != null) next = Math.max(min, next);
        if (max != null) next = Math.min(max, next);
        return next;
    };

    const commit = (value: number) => {
        const next = clamp(value);
        setText(formatSrtTime(next));
        onCommit(next);
    };

    return (
        <input
            type="text"
            className="time-input"
            value={text}
            spellCheck={false}
            aria-label={ariaLabel}
            title="↑↓ or ←→ to nudge 100ms · Shift for 1s"
            onClick={(e) => e.stopPropagation()}
            onFocus={() => { focusedRef.current = true; }}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => {
                focusedRef.current = false;
                commit(parseSrtTime(text));
            }}
            onKeyDown={(e) => {
                const step = e.shiftKey ? TIME_NUDGE_SHIFT_SEC : TIME_NUDGE_SEC;
                if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    commit(seconds + step);
                } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
                    e.preventDefault();
                    commit(seconds - step);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    e.currentTarget.blur();
                }
            }}
        />
    );
}

interface SubtitleEditorProps {
    subtitles: Subtitle[];
    onSubtitlesChange: (subtitles: Subtitle[]) => void;
    currentTime: number;
    mediaDuration?: number; // Actual media file duration
    onSeek: (time: number) => void;
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
}

export function SubtitleEditor({ subtitles, onSubtitlesChange, currentTime, mediaDuration, onSeek, onUndo, onRedo, canUndo, canRedo }: SubtitleEditorProps) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [autoScroll, setAutoScroll] = useState(true);
    const activeRef = useRef<HTMLDivElement | null>(null);
    const editorRefs = useRef<{ [key: string]: RichTextEditorRef | null }>({});
    const [activeStyles, setActiveStyles] = useState({ bold: false, italic: false, underline: false, size: '' });

    // Search State
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [replaceQuery, setReplaceQuery] = useState('');
    const [matches, setMatches] = useState<string[]>([]); // Array of subtitle IDs
    const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
    const searchInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (autoScroll && activeRef.current && !editingId) {
            activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [autoScroll, currentTime, editingId]);

    // Focus search input when shown
    useEffect(() => {
        if (showSearch && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [showSearch]);

    // Keyboard shortcut for search
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
                e.preventDefault();
                setShowSearch(prev => !prev);
                if (!showSearch) {
                    // Reset search when opening
                    setSearchQuery('');
                    setMatches([]);
                    setCurrentMatchIndex(-1);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showSearch]);

    // Search Logic
    const performSearch = useCallback((query: string) => {
        setSearchQuery(query);
        if (!query.trim()) {
            setMatches([]);
            setCurrentMatchIndex(-1);
            return;
        }

        const lowerQuery = query.toLowerCase();
        const newMatches = subtitles
            .filter(sub => sub.text.toLowerCase().includes(lowerQuery))
            .map(sub => sub.id);

        setMatches(newMatches);

        // Try to preserve current match if still valid, otherwise reset
        if (newMatches.length > 0) {
            const currentId = matches[currentMatchIndex];
            const newIndex = newMatches.indexOf(currentId);
            setCurrentMatchIndex(newIndex !== -1 ? newIndex : 0);

            // Scroll to first match if new search
            if (newIndex === -1 && matches.length !== newMatches.length) {
                const sub = subtitles.find(s => s.id === newMatches[0]);
                if (sub) onSeek(sub.startTime);
            }
        } else {
            setCurrentMatchIndex(-1);
        }
    }, [subtitles, matches, currentMatchIndex, onSeek]);

    const handleNextMatch = useCallback(() => {
        if (matches.length === 0) return;
        const nextIndex = (currentMatchIndex + 1) % matches.length;
        setCurrentMatchIndex(nextIndex);

        const subId = matches[nextIndex];
        const sub = subtitles.find(s => s.id === subId);
        if (sub) {
            onSeek(sub.startTime);
            // Ensure visualization follows
            setAutoScroll(true);
        }
    }, [matches, currentMatchIndex, subtitles, onSeek]);

    const handlePrevMatch = useCallback(() => {
        if (matches.length === 0) return;
        const prevIndex = (currentMatchIndex - 1 + matches.length) % matches.length;
        setCurrentMatchIndex(prevIndex);

        const subId = matches[prevIndex];
        const sub = subtitles.find(s => s.id === subId);
        if (sub) {
            onSeek(sub.startTime);
            setAutoScroll(true);
        }
    }, [matches, currentMatchIndex, subtitles, onSeek]);

    const handleReplace = useCallback(() => {
        if (currentMatchIndex === -1 || matches.length === 0) return;

        const subId = matches[currentMatchIndex];
        const sub = subtitles.find(s => s.id === subId);
        if (!sub) return;

        // Replace only the first occurrence or all? Standard is usually next occurrence.
        // Simple regex replace for the first occurrence (case insensitive to match search)
        const regex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        const newText = sub.text.replace(regex, replaceQuery);

        // Update subtitles
        const newSubtitles = subtitles.map(s => s.id === subId ? { ...s, text: newText } : s);
        onSubtitlesChange(newSubtitles);

        // Re-run search to update matches, but try to stay close to current position
        // We need to wait for the update to propagate? Or just manually update local state logic?
        // Since onSubtitlesChange triggers a re-render and re-eval of this component,
        // we might lose the search interaction if we don't be careful.
        // Actually, performSearch depends on `subtitles`. 
        // We can manually adjust matches list.

        // If the replacement means it no longer matches the query, remove from matches
        if (!newText.toLowerCase().includes(searchQuery.toLowerCase())) {
            const newMatches = matches.filter(id => id !== subId);
            setMatches(newMatches);
            if (newMatches.length > 0) {
                setCurrentMatchIndex(currentMatchIndex % newMatches.length);
            } else {
                setCurrentMatchIndex(-1);
            }
        }
        // If it still matches (e.g. replaced "test" with "testing"), keep it?
        // Usually "Replace" moves to the NEXT match after replacing.
        else {
            handleNextMatch();
        }

    }, [currentMatchIndex, matches, subtitles, searchQuery, replaceQuery, onSubtitlesChange, handleNextMatch]);

    const handleReplaceAll = useCallback(() => {
        if (!searchQuery.trim()) return;

        const regex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        let count = 0;

        const newSubtitles = subtitles.map(sub => {
            if (matches.includes(sub.id)) {
                if (sub.text.match(regex)) {
                    count++;
                }
                return { ...sub, text: sub.text.replace(regex, replaceQuery) };
            }
            return sub;
        });

        if (count > 0) {
            onSubtitlesChange(newSubtitles);
            // Clear matches as we likely replaced them all (unless replace string contains search string)
            if (!replaceQuery.toLowerCase().includes(searchQuery.toLowerCase())) {
                setMatches([]);
                setCurrentMatchIndex(-1);
            }
        }
    }, [subtitles, matches, searchQuery, replaceQuery, onSubtitlesChange]);


    const handleTextChange = useCallback((id: string, text: string) => {
        onSubtitlesChange(
            subtitles.map(sub => sub.id === id ? { ...sub, text } : sub)
        );
    }, [subtitles, onSubtitlesChange]);

    const handleTimeChange = useCallback((id: string, field: 'startTime' | 'endTime', seconds: number) => {
        onSubtitlesChange(
            subtitles.map(sub => {
                if (sub.id !== id) return sub;
                if (field === 'startTime') {
                    return { ...sub, startTime: Math.min(seconds, roundMs(sub.endTime - 0.05)) };
                }
                return { ...sub, endTime: Math.max(seconds, roundMs(sub.startTime + 0.05)) };
            })
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

    const handleInsertBetween = useCallback((afterIndex: number) => {
        const prev = subtitles[afterIndex];
        const next = subtitles[afterIndex + 1];
        if (!prev || !next) return;
        const gap = next.startTime - prev.endTime;
        if (gap < MIN_INSERT_DURATION) return;

        const newSub: Subtitle = {
            id: generateId(),
            index: 0,
            startTime: prev.endTime,
            endTime: next.startTime,
            text: '',
        };
        const nextList = [
            ...subtitles.slice(0, afterIndex + 1),
            newSub,
            ...subtitles.slice(afterIndex + 1),
        ].map((s, i) => ({ ...s, index: i + 1 }));
        onSubtitlesChange(nextList);
        setEditingId(newSub.id);
    }, [subtitles, onSubtitlesChange]);

    const handleMergePair = useCallback((firstIndex: number) => {
        const first = subtitles[firstIndex];
        const second = subtitles[firstIndex + 1];
        if (!first || !second) return;

        const mergedText = [first.text, second.text]
            .map(t => t.trim())
            .filter(Boolean)
            .join('\n');

        const merged: Subtitle = {
            ...first,
            endTime: second.endTime,
            text: mergedText,
        };
        const nextList = [
            ...subtitles.slice(0, firstIndex),
            merged,
            ...subtitles.slice(firstIndex + 2),
        ].map((s, i) => ({ ...s, index: i + 1 }));
        onSubtitlesChange(nextList);
        if (editingId === second.id) setEditingId(merged.id);
    }, [subtitles, onSubtitlesChange, editingId]);

    const isActive = (sub: Subtitle) =>
        currentTime >= sub.startTime && currentTime <= sub.endTime;

    // Helper to highlight text
    const highlightText = (text: string, query: string) => {
        if (!query.trim()) return text;

        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        const parts = text.split(regex);

        return parts.map((part, i) =>
            part.toLowerCase() === query.toLowerCase() ?
                <mark key={i}>{part}</mark> : part
        );
    };

    const applyStyle = useCallback((tag: string) => {
        if (!editingId) return;
        const editor = editorRefs.current[editingId];
        if (!editor) return;

        if (tag === 'b') editor.execCommand('bold');
        else if (tag === 'i') editor.execCommand('italic');
        else if (tag === 'u') editor.execCommand('underline');
        else if (tag === 'size') {
            // Safe fallback for now - maybe cycle sizes later
            // const size = window.prompt("Enter size (1-7):", "3") || "3";
            // editor.execCommand('fontSize', size);
        }
    }, [editingId]);

    // Global keyboard shortcuts for styling when editing
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!editingId) return;
            if (!(e.metaKey || e.ctrlKey)) return;

            if (e.key.toLowerCase() === 'b') {
                e.preventDefault();
                applyStyle('b');
            } else if (e.key.toLowerCase() === 'i') {
                e.preventDefault();
                applyStyle('i');
            } else if (e.key.toLowerCase() === 'u') {
                e.preventDefault();
                applyStyle('u');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [editingId, applyStyle]);

    return (
        <div className="subtitle-editor">
            <EditorHeader
                showSearch={showSearch}
                onToggleSearch={() => setShowSearch(!showSearch)}
                autoScroll={autoScroll}
                onToggleAutoScroll={setAutoScroll}
                canUndo={canUndo}
                canRedo={canRedo}
                onUndo={onUndo}
                onRedo={onRedo}
                activeStyles={activeStyles}
                onApplyStyle={applyStyle}
                entryCount={subtitles.length}
            />

            {showSearch && (
                <div className="search-bar">
                    <div className="search-inputs">
                        <div className="search-input-group">
                            <span className="icon icon-sm search-icon">search</span>
                            <input
                                ref={searchInputRef}
                                type="text"
                                placeholder="Find..."
                                value={searchQuery}
                                onChange={(e) => performSearch(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        if (e.shiftKey) handlePrevMatch();
                                        else handleNextMatch();
                                    }
                                    if (e.key === 'Escape') setShowSearch(false);
                                }}
                            />
                            {matches.length > 0 && (
                                <span className="search-counter">
                                    {currentMatchIndex + 1} of {matches.length}
                                </span>
                            )}
                            <div className="search-nav">
                                <button className="btn-icon-tiny" onClick={handlePrevMatch} title="Previous Match" disabled={matches.length === 0}>
                                    <span className="icon icon-sm">expand_less</span>
                                </button>
                                <button className="btn-icon-tiny" onClick={handleNextMatch} title="Next Match" disabled={matches.length === 0}>
                                    <span className="icon icon-sm">expand_more</span>
                                </button>
                            </div>
                        </div>
                        <div className="search-input-group">
                            <span className="icon icon-sm search-icon">edit</span>
                            <input
                                type="text"
                                placeholder="Replace with..."
                                value={replaceQuery}
                                onChange={(e) => setReplaceQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleReplace();
                                }}
                            />
                        </div>
                    </div>
                    <div className="search-actions">
                        <button className="btn-small" onClick={handleReplace} disabled={matches.length === 0}>Replace</button>
                        <button className="btn-small" onClick={handleReplaceAll} disabled={matches.length === 0}>Replace All</button>
                        <button className="btn-icon-tiny close-search" onClick={() => setShowSearch(false)}>
                            <span className="icon icon-sm">close</span>
                        </button>
                    </div>
                </div>
            )}

            {subtitles.length === 0 ? (
                <div className="empty-state">
                    <p>No subtitles yet</p>
                    <p className="hint">To get started, click "Generate Subtitles" or Import Subtitles</p>
                </div>
            ) : (
                <div className="subtitle-list" role="list">
                    {subtitles.map((sub, i) => {
                        const isBeyondMedia = mediaDuration ? sub.startTime > mediaDuration : false;
                        const isMatch = matches.includes(sub.id);
                        const isCurrentMatch = matches[currentMatchIndex] === sub.id;
                        const nextSub = subtitles[i + 1];
                        const gapDuration = nextSub ? nextSub.startTime - sub.endTime : 0;
                        const canInsert = Boolean(nextSub) && gapDuration >= MIN_INSERT_DURATION;

                        // Viewing logic: if not editing, check for search highlights
                        const showHighlight = (showSearch && searchQuery && isMatch) && editingId !== sub.id;

                        return (
                            <Fragment key={sub.id}>
                            <div
                                ref={isActive(sub) ? activeRef : null}
                                className={`subtitle-entry ${isActive(sub) ? 'active' : ''} ${editingId === sub.id ? 'editing' : ''} ${isBeyondMedia ? 'beyond-media' : ''} ${isCurrentMatch ? 'search-match' : ''}`}
                                onClick={() => onSeek(sub.startTime)}
                                title={isBeyondMedia ? "This subtitle starts after the media ends" : ""}
                            >
                                <div className="subtitle-index">{sub.index}</div>

                                <div className="subtitle-times">
                                    <TimeInput
                                        seconds={sub.startTime}
                                        onCommit={(value) => handleTimeChange(sub.id, 'startTime', value)}
                                        min={0}
                                        max={roundMs(sub.endTime - 0.05)}
                                        ariaLabel={`Subtitle ${sub.index} start time`}
                                    />
                                    <span className="time-separator">→</span>
                                    <TimeInput
                                        seconds={sub.endTime}
                                        onCommit={(value) => handleTimeChange(sub.id, 'endTime', value)}
                                        min={roundMs(sub.startTime + 0.05)}
                                        max={mediaDuration}
                                        ariaLabel={`Subtitle ${sub.index} end time`}
                                    />
                                </div>

                                {showHighlight ? (
                                    <div
                                        className="subtitle-text-display"
                                        dir={detectDirection(sub.text)}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingId(sub.id);
                                        }}
                                    >
                                        {highlightText(sub.text, searchQuery)}
                                    </div>
                                ) : editingId !== sub.id ? (
                                    <div
                                        className="subtitle-text-display styled-preview"
                                        dir={detectDirection(sub.text)}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingId(sub.id);
                                        }}
                                    >
                                        <StyledText text={sub.text} />
                                    </div>
                                ) : (
                                    <RichTextEditor
                                        ref={el => { editorRefs.current[sub.id] = el; }}
                                        className="subtitle-text"
                                        value={sub.text}
                                        onChange={(text) => handleTextChange(sub.id, text)}
                                        onBlur={(e) => {
                                            if (e.relatedTarget && (e.relatedTarget as HTMLElement).closest('.editor-styling-toolbar')) {
                                                return;
                                            }
                                            setEditingId(null);
                                        }}
                                        onStatusChange={setActiveStyles}
                                        placeholder="Enter subtitle text..."
                                        autoFocus={editingId === sub.id}
                                    />
                                )}

                                <button
                                    className="delete-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete(sub.id);
                                    }}
                                    title="Delete subtitle"
                                    aria-label={`Delete subtitle ${sub.index}`}
                                >
                                    <span className="icon icon-sm">close</span>
                                </button>
                            </div>
                            {nextSub && (
                                <div className="subtitle-gap" role="group" aria-label={`Actions between subtitle ${sub.index} and ${nextSub.index}`}>
                                    <button
                                        type="button"
                                        className="gap-action-btn"
                                        disabled={!canInsert}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleInsertBetween(i);
                                        }}
                                        title={canInsert
                                            ? 'Add a line in the gap — existing times stay as they are'
                                            : 'Not enough time between these lines to add another subtitle'}
                                        aria-label={canInsert
                                            ? `Add subtitle between ${sub.index} and ${nextSub.index}`
                                            : `Cannot add a subtitle between ${sub.index} and ${nextSub.index} — not enough time`}
                                    >
                                        <span className="icon icon-sm">add</span>
                                    </button>
                                    <button
                                        type="button"
                                        className="gap-action-btn gap-action-merge"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleMergePair(i);
                                        }}
                                        title="Merge these two lines into one"
                                        aria-label={`Merge subtitle ${sub.index} and ${nextSub.index}`}
                                    >
                                        <span className="icon icon-sm">call_merge</span>
                                    </button>
                                </div>
                            )}
                            </Fragment>
                        );
                    })}

                    <button className="add-subtitle-btn" onClick={handleAdd}>
                        <span className="icon icon-sm">add</span> Add New Line
                    </button>
                </div>
            )}
        </div>
    );
}
