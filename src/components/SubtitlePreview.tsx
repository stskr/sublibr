import { useRef, useEffect, useState, useCallback } from 'react';
import { detectDirection } from '../utils';
import { StyledText } from './common/StyledText';
import { RichTextEditor } from './common/RichTextEditor';
import type { RichTextEditorRef } from './common/RichTextEditor';
import type { Subtitle, MediaFile } from '../types';

interface SubtitlePreviewProps {
    subtitles: Subtitle[];
    currentTime: number;
    mediaFile: MediaFile;
    onSubtitleChange?: (id: string, text: string) => void;
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
}

export function SubtitlePreview({ subtitles, currentTime, mediaFile, onSubtitleChange, onUndo, onRedo, canUndo, canRedo }: SubtitlePreviewProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const textareaRef = useRef<RichTextEditorRef>(null);
    const [videoReady, setVideoReady] = useState(false);
    const [isPaused, setIsPaused] = useState(true);
    const [editingSubtitleId, setEditingSubtitleId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');
    const [activeStyles, setActiveStyles] = useState({ bold: false, italic: false, underline: false, color: '', size: '' });

    // Find active subtitle at current time
    const activeSub = subtitles.find(
        sub => currentTime >= sub.startTime && currentTime <= sub.endTime
    );
    const subtitleText = activeSub?.text || '';
    const direction = subtitleText ? detectDirection(subtitleText) : 'ltr';

    // Load video source via media:// protocol
    useEffect(() => {
        if (!mediaFile.isVideo || !videoRef.current) return;

        const safePath = encodeURIComponent(mediaFile.path);
        videoRef.current.src = `media://${safePath}`;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setVideoReady(true);
    }, [mediaFile.path, mediaFile.isVideo]);

    // Sync video currentTime with audio player's currentTime
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !videoReady) return;

        const diff = Math.abs(video.currentTime - currentTime);
        if (diff > 0.3) {
            video.currentTime = currentTime;
        }
    }, [currentTime, videoReady]);

    // Sync play/pause state with audio player
    const syncPlayState = useCallback(() => {
        const video = videoRef.current;
        if (!video || !videoReady) return;

        // Find the audio element from AudioPlayer
        const audioEl = document.querySelector('audio');
        if (!audioEl) return;

        const isAudioPaused = audioEl.paused;
        if (isPaused !== isAudioPaused) {
            setIsPaused(isAudioPaused);
        }

        if (isAudioPaused && !video.paused) {
            video.pause();
        } else if (!isAudioPaused && video.paused) {
            video.play().catch(() => {/* ignore autoplay issues */ });
        }
    }, [videoReady, isPaused]);

    useEffect(() => {
        const audioEl = document.querySelector('audio');
        // Initial state check
        if (audioEl && audioEl.paused !== isPaused) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setIsPaused(audioEl.paused);
        }

        if (!audioEl || !mediaFile.isVideo) return;

        const onPlay = () => syncPlayState();
        const onPause = () => syncPlayState();

        audioEl.addEventListener('play', onPlay);
        audioEl.addEventListener('pause', onPause);

        // Initial sync
        syncPlayState();

        return () => {
            audioEl.removeEventListener('play', onPlay);
            audioEl.removeEventListener('pause', onPause);
        };
    }, [syncPlayState, mediaFile.isVideo, isPaused]);

    // Handle click to edit
    const handleSubtitleClick = useCallback(() => {
        if (isPaused && activeSub && onSubtitleChange) {
            setEditingSubtitleId(activeSub.id);
            setEditText(activeSub.text);
            // Delay focus slightly to ensure render
            setTimeout(() => {
                if (textareaRef.current) {
                    textareaRef.current.focus();
                }
            }, 10);
        }
    }, [isPaused, activeSub, onSubtitleChange]);

    // Save changes
    const handleSave = useCallback(() => {
        if (editingSubtitleId && activeSub && onSubtitleChange) {
            if (editText !== activeSub.text) {
                onSubtitleChange(editingSubtitleId, editText);
            }
        }
        setEditingSubtitleId(null);
    }, [editingSubtitleId, activeSub, onSubtitleChange, editText]);

    const applyStyle = useCallback((tag: string) => {
        if (!editingSubtitleId || !textareaRef.current) return;
        const editor = textareaRef.current;

        if (tag === 'b') editor.execCommand('bold');
        else if (tag === 'i') editor.execCommand('italic');
        else if (tag === 'u') editor.execCommand('underline');
        else if (tag === 'font') {
            const color = window.prompt("Enter color (e.g. red, #ff0000):", "red") || "red";
            editor.execCommand('foreColor', color);
        }
    }, [editingSubtitleId]);

    // Handle keydown in textarea
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        e.stopPropagation(); // Prevent app shortcuts

        // WYSIWYG shortcuts are handled by browser/RichTextEditor, 
        // but we can still intercept them here if needed.

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSave();
        } else if (e.key === 'Escape') {
            setEditingSubtitleId(null);
        }
    }, [handleSave]);


    // No auto-resize needed for contenteditable as it grows with content

    // Render toolbar
    const renderToolbar = () => (
        <div className="preview-subtitle-toolbar" style={{
            position: 'absolute',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 20,
            opacity: 1, // Always visible
            display: 'flex',
            gap: '4px',
            background: 'rgba(0,0,0,0.6)',
            padding: '8px',
            borderRadius: '8px'
        }}>
            <button
                onMouseDown={(e) => { e.preventDefault(); if (onUndo) onUndo(); }}
                title="Undo (Ctrl+Z)"
                disabled={!canUndo}
            >
                <span className="icon icon-sm">undo</span>
            </button>
            <button
                onMouseDown={(e) => { e.preventDefault(); if (onRedo) onRedo(); }}
                title="Redo (Ctrl+Shift+Z)"
                disabled={!canRedo}
            >
                <span className="icon icon-sm">redo</span>
            </button>
            <div className="toolbar-divider" style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.2)', margin: '0 4px' }} />
            <button
                className={activeStyles.bold ? 'active' : ''}
                onMouseDown={(e) => { e.preventDefault(); applyStyle('b'); }}
                title="Bold (Ctrl+B)"
                disabled={!editingSubtitleId}
            >
                <span className="icon icon-sm">format_bold</span>
            </button>
            <button
                className={activeStyles.italic ? 'active' : ''}
                onMouseDown={(e) => { e.preventDefault(); applyStyle('i'); }}
                title="Italic (Ctrl+I)"
                disabled={!editingSubtitleId}
            >
                <span className="icon icon-sm">format_italic</span>
            </button>
            <button
                className={activeStyles.underline ? 'active' : ''}
                onMouseDown={(e) => { e.preventDefault(); applyStyle('u'); }}
                title="Underline (Ctrl+U)"
                disabled={!editingSubtitleId}
            >
                <span className="icon icon-sm">format_underlined</span>
            </button>
            <button
                onMouseDown={(e) => { e.preventDefault(); applyStyle('font'); }}
                title="Color"
                disabled={!editingSubtitleId}
            >
                <span className="icon icon-sm">palette</span>
            </button>
        </div>
    );

    // Render subtitle content (text or textarea)
    const renderSubtitleContent = () => {
        const isEditing = editingSubtitleId === activeSub?.id;

        if (isEditing) {
            return (
                <div className="preview-subtitle-editor-container">
                    {/* Toolbar is now rendered globally */}
                    <RichTextEditor
                        ref={textareaRef}
                        className="preview-subtitle-textarea"
                        value={editText}
                        onChange={setEditText}
                        onBlur={handleSave}
                        onKeyDown={handleKeyDown}
                        onStatusChange={setActiveStyles}
                    />
                </div>
            );
        }

        if (!subtitleText) return null;

        return (
            <div
                className={`preview-subtitle${mediaFile.isVideo ? '' : ' cinema-subtitle'}`}
                dir={direction}
                style={{
                    direction,
                    cursor: isPaused && onSubtitleChange ? 'pointer' : 'default',
                    border: isPaused && onSubtitleChange ? '1px dashed transparent' : 'none'
                }}
                onClick={handleSubtitleClick}
                title={isPaused ? "Click to edit" : undefined}
                aria-live="polite"
            >
                <StyledText text={subtitleText} />
            </div>
        );
    };

    if (mediaFile.isVideo) {
        return (
            <div className="subtitle-preview">
                <div className="preview-video-wrapper">
                    <video
                        ref={videoRef}
                        muted
                        playsInline
                    />
                    {renderSubtitleContent()}
                    {renderToolbar()}
                </div>
            </div>
        );
    }

    // Audio file: cinema screen
    return (
        <div className="subtitle-preview">
            <div className={`preview-cinema${mediaFile.isVideo ? '' : ' audio-mode'}`}>
                {renderToolbar()}
                {subtitleText || editingSubtitleId ? (
                    renderSubtitleContent()
                ) : (
                    <div className="preview-cinema-idle">
                        <span className="icon icon-xl">subtitles</span>
                        <p>No subtitle at current time</p>
                    </div>
                )}
            </div>
        </div>
    );
}
