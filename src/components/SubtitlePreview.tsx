import React, { useRef, useEffect, useState, useCallback } from 'react';
import { detectDirection, buildSubtitleTextShadow, hexToRgba } from '../utils';
import { StyledText } from './common/StyledText';
import { RichTextEditor } from './common/RichTextEditor';
import { EditorHeader } from './common/EditorHeader';
import type { RichTextEditorRef } from './common/RichTextEditor';
import type { Subtitle, MediaFile, SubtitleStyle } from '../types';
import { DEFAULT_SUBTITLE_STYLE as DEFAULT_STYLE } from '../types';

interface SubtitlePreviewProps {
    subtitles: Subtitle[];
    currentTime: number;
    mediaFile: MediaFile;
    subtitleStyle?: SubtitleStyle;
    onSubtitleChange?: (id: string, text: string) => void;
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
}

export function SubtitlePreview({ subtitles, currentTime, mediaFile, subtitleStyle, onSubtitleChange, onUndo, onRedo, canUndo, canRedo }: SubtitlePreviewProps) {
    const style = subtitleStyle ?? DEFAULT_STYLE;
    const videoRef = useRef<HTMLVideoElement>(null);
    const textareaRef = useRef<RichTextEditorRef>(null);
    const [videoReady, setVideoReady] = useState(false);
    const [isPaused, setIsPaused] = useState(true);
    const [editingSubtitleId, setEditingSubtitleId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');
    const [activeStyles, setActiveStyles] = useState({ bold: false, italic: false, underline: false, size: '' });

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

    // Render subtitle content (text or textarea)
    const renderSubtitleContent = () => {
        const isEditing = editingSubtitleId === activeSub?.id;

        if (isEditing) {
            return (
                <div className="preview-subtitle-editor-container">
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

        const overlayStyle: React.CSSProperties = {
            direction,
            cursor: isPaused && onSubtitleChange ? 'pointer' : 'default',
            border: isPaused && onSubtitleChange ? '1px dashed transparent' : 'none',
            // Global subtitle style (per-word <font color> tags override via CSS cascade)
            color: style.textColor,
            fontFamily: style.fontFamily,
            textShadow: buildSubtitleTextShadow(style),
            background: style.backgroundEnabled
                ? hexToRgba(style.backgroundColor, style.backgroundOpacity)
                : 'transparent',
        };

        return (
            <div
                className={`preview-subtitle${mediaFile.isVideo ? '' : ' cinema-subtitle'}`}
                dir={direction}
                style={overlayStyle}
                onClick={handleSubtitleClick}
                title={isPaused ? "Click to edit" : undefined}
                aria-live="polite"
            >
                <StyledText text={subtitleText} />
            </div>
        );
    };

    return (
        <div className="subtitle-preview">
            <EditorHeader
                canUndo={canUndo}
                canRedo={canRedo}
                onUndo={onUndo}
                onRedo={onRedo}
                activeStyles={activeStyles}
                onApplyStyle={applyStyle}
                entryCount={subtitles.length}
                hideSearch
                hideAutoScroll
                disableFormatting={!editingSubtitleId}
            />
            {mediaFile.isVideo ? (
                <div className="preview-video-wrapper">
                    <video
                        ref={videoRef}
                        muted
                        playsInline
                    />
                    {renderSubtitleContent()}
                </div>
            ) : (
                <div className={`preview-cinema${mediaFile.isVideo ? '' : ' audio-mode'}`}>
                    {subtitleText || editingSubtitleId ? (
                        renderSubtitleContent()
                    ) : (
                        <div className="preview-cinema-idle">
                            <span className="icon icon-xl">subtitles</span>
                            <p>No subtitle at current time</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
