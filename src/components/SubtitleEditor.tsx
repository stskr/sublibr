import { useState, useCallback, useRef, useEffect } from 'react';
import { formatSrtTime, parseSrtTime, generateId, detectDirection } from '../utils';
import { StyledText } from './common/StyledText';
import { RichTextEditor } from './common/RichTextEditor';
import { EditorHeader } from './common/EditorHeader';
import type { RichTextEditorRef } from './common/RichTextEditor';
import type { Subtitle } from '../types';

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
    const [activeStyles, setActiveStyles] = useState({ bold: false, italic: false, underline: false, color: '', size: '' });
    const colorInputRef = useRef<HTMLInputElement>(null);

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
        else if (tag === 'font') {
            // Trigger color input
            colorInputRef.current?.click();
        } else if (tag === 'size') {
            // Safe fallback for now - maybe cycle sizes later
            // const size = window.prompt("Enter size (1-7):", "3") || "3";
            // editor.execCommand('fontSize', size);
        }
    }, [editingId]);

    const handleColorClick = useCallback(() => {
        if (!editingId) return;
        const editor = editorRefs.current[editingId];
        if (editor) editor.saveSelection();
    }, [editingId]);

    const handleColorChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (!editingId) return;
        const editor = editorRefs.current[editingId];
        if (!editor) return;

        editor.restoreSelection();
        editor.execCommand('foreColor', e.target.value);
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
                colorInputRef={colorInputRef}
                onColorClick={handleColorClick}
                onColorChange={handleColorChange}
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
                    {subtitles.map((sub) => {
                        const isBeyondMedia = mediaDuration ? sub.startTime > mediaDuration : false;
                        const isMatch = matches.includes(sub.id);
                        const isCurrentMatch = matches[currentMatchIndex] === sub.id;

                        // Viewing logic: if not editing, check for search highlights
                        const showHighlight = (showSearch && searchQuery && isMatch) && editingId !== sub.id;

                        return (
                            <div
                                key={sub.id}
                                ref={isActive(sub) ? activeRef : null}
                                className={`subtitle-entry ${isActive(sub) ? 'active' : ''} ${editingId === sub.id ? 'editing' : ''} ${isBeyondMedia ? 'beyond-media' : ''} ${isCurrentMatch ? 'search-match' : ''}`}
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
                                        aria-label={`Subtitle ${sub.index} start time`}
                                    />
                                    <span className="time-separator">→</span>
                                    <input
                                        key={`end-${sub.id}-${sub.endTime}`}
                                        type="text"
                                        className="time-input"
                                        defaultValue={formatSrtTime(sub.endTime)}
                                        onBlur={(e) => handleTimeBlur(sub.id, 'endTime', e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                        aria-label={`Subtitle ${sub.index} end time`}
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
                                            // Don't effectively blur if we're clicking the color picker
                                            // The color picker input handles focus restoration
                                            if (e.relatedTarget && (e.relatedTarget as HTMLElement).getAttribute('type') === 'color') {
                                                return;
                                            }
                                            // Also check if we're clicking inside the color picker container
                                            // Sometimes the click target might be the wrapper
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
