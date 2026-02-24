import React, { useRef, useEffect, useState, useCallback } from 'react';
import { detectDirection, buildSubtitleTextShadow, hexToRgba } from '../utils';
import { StyledText } from './common/StyledText';
import { RichTextEditor } from './common/RichTextEditor';
import { EditorHeader } from './common/EditorHeader';
import type { RichTextEditorRef } from './common/RichTextEditor';
import type { Subtitle, MediaFile, SubtitleStyle, ScreenSize } from '../types';
import { DEFAULT_SUBTITLE_STYLE as DEFAULT_STYLE, getPlayRes } from '../types';

// Returns the [width, height] of the render canvas matching the selected resolution.
function getCanvasDimensions(renderResolution: ScreenSize, mediaFile: MediaFile): [number, number] {
    switch (renderResolution) {
        case 'wide':     return [16, 9];
        case 'square':   return [1, 1];
        case 'vertical': return [9, 16];
        case 'original':
        default:
            return mediaFile.width && mediaFile.height
                ? [mediaFile.width, mediaFile.height]
                : [16, 9];
    }
}

interface SubtitlePreviewProps {
    subtitles: Subtitle[];
    currentTime: number;
    mediaFile: MediaFile;
    subtitleStyle?: SubtitleStyle;
    renderResolution?: ScreenSize;
    onSubtitleChange?: (id: string, text: string) => void;
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
}

export function SubtitlePreview({ subtitles, currentTime, mediaFile, subtitleStyle, renderResolution = 'original', onSubtitleChange, onUndo, onRedo, canUndo, canRedo }: SubtitlePreviewProps) {
    const style = subtitleStyle ?? DEFAULT_STYLE;
    const [canvasW, canvasH] = getCanvasDimensions(renderResolution, mediaFile);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<RichTextEditorRef>(null);
    const [videoReady, setVideoReady] = useState(false);
    const [isPaused, setIsPaused] = useState(true);
    const [editingSubtitleId, setEditingSubtitleId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');
    const [activeStyles, setActiveStyles] = useState({ bold: false, italic: false, underline: false, size: '' });
    const [canvasPixelWidth, setCanvasPixelWidth] = useState<number | null>(null);

    // Track render canvas CSS width for proportional font scaling
    useEffect(() => {
        const el = canvasRef.current;
        if (!el) return;
        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                setCanvasPixelWidth(entry.contentRect.width);
            }
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

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

    // Compute display font size: scale style.fontSize (ASS PlayRes units) to CSS canvas pixels.
    // This makes the preview match the actual render proportions across all aspect ratios.
    const [playResX] = getPlayRes(renderResolution, mediaFile.width, mediaFile.height);
    const displayFontSize = canvasPixelWidth != null
        ? Math.max(8, (style.fontSize / playResX) * canvasPixelWidth)
        : undefined;

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

        const posX = style.positionX ?? DEFAULT_STYLE.positionX;
        const posY = style.positionY ?? DEFAULT_STYLE.positionY;

        const overlayStyle: React.CSSProperties = {
            // Position within the render canvas (matches ASS \pos coordinate space)
            ...(mediaFile.isVideo ? {
                top: `${posY}%`,
                left: `${posX}%`,
                transform: `translate(-50%, -100%)`,
                bottom: 'auto',
            } : {}),
            direction,
            cursor: isPaused && onSubtitleChange ? 'pointer' : 'default',
            border: isPaused && onSubtitleChange ? '1px dashed transparent' : 'none',
            // Global subtitle style (per-word <font color> tags override via CSS cascade)
            color: style.textColor,
            fontFamily: style.fontFamily,
            fontSize: displayFontSize != null ? `${displayFontSize}px` : undefined,
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
                {subtitleText.split('\n').map((line, i) => (
                    <span key={i} className="preview-subtitle-line">
                        <StyledText text={line} />
                    </span>
                ))}
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
                    {/* Render canvas: matches the target render resolution's aspect ratio.
                        The video is object-fit:contain inside it (simulates FFmpeg scale+pad).
                        Subtitles are positioned at X%/Y% of this canvas — same reference
                        frame as the ASS \pos coordinates. */}
                    <div
                        ref={canvasRef}
                        className="preview-render-canvas"
                        style={{ aspectRatio: `${canvasW} / ${canvasH}` }}
                    >
                        <video
                            ref={videoRef}
                            muted
                            playsInline
                        />
                        {/* Overlay fills canvas exactly */}
                        <div className="preview-subtitle-overlay">
                            {renderSubtitleContent()}
                        </div>
                    </div>
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
