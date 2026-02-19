import { useRef, useEffect, useState, useCallback } from 'react';
import { detectDirection } from '../utils';
import type { Subtitle, MediaFile } from '../types';

interface SubtitlePreviewProps {
    subtitles: Subtitle[];
    currentTime: number;
    mediaFile: MediaFile;
    onSubtitleChange?: (id: string, text: string) => void;
}

export function SubtitlePreview({ subtitles, currentTime, mediaFile, onSubtitleChange }: SubtitlePreviewProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [videoReady, setVideoReady] = useState(false);
    const [isPaused, setIsPaused] = useState(true);
    const [editingSubtitleId, setEditingSubtitleId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');

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
                    textareaRef.current.select();
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

    // Handle keydown in textarea
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        e.stopPropagation(); // Prevent app shortcuts
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSave();
        } else if (e.key === 'Escape') {
            setEditingSubtitleId(null);
        }
    }, [handleSave]);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    }, [editText, editingSubtitleId]);

    // Render subtitle content (text or textarea)
    const renderSubtitleContent = () => {
        const isEditing = editingSubtitleId === activeSub?.id;

        if (isEditing) {
            return (
                <textarea
                    ref={textareaRef}
                    className="preview-subtitle-textarea"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onBlur={handleSave}
                    onKeyDown={handleKeyDown}
                    dir={detectDirection(editText)}
                    style={{ direction: detectDirection(editText) as import('react').CSSProperties['direction'] }}
                    aria-label="Edit subtitle"
                />
            );
        }

        if (!subtitleText) return null;

        return (
            <div
                className={`preview-subtitle${mediaFile.isVideo ? '' : ' cinema-subtitle'}`}
                dir={direction}
                style={{
                    direction,
                    cursor: isPaused && onSubtitleChange ? 'text' : 'default',
                    border: isPaused && onSubtitleChange ? '1px dashed transparent' : 'none'
                }}
                onClick={handleSubtitleClick}
                title={isPaused ? "Click to edit" : undefined}
                aria-live="polite"
            >
                {subtitleText}
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
                </div>
            </div>
        );
    }

    // Audio file: cinema screen
    return (
        <div className="subtitle-preview">
            <div className={`preview-cinema${mediaFile.isVideo ? '' : ' audio-mode'}`}>
                {subtitleText || editingSubtitleId ? (
                    renderSubtitleContent()
                ) : (
                    <div className="preview-cinema-idle">
                        <span className="icon icon-xl">subtitles</span>
                    </div>
                )}
            </div>
        </div>
    );
}
