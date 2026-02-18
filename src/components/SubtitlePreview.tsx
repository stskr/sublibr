import { useRef, useEffect, useState, useCallback } from 'react';
import { detectDirection } from '../utils';
import type { Subtitle, MediaFile } from '../types';

interface SubtitlePreviewProps {
    subtitles: Subtitle[];
    currentTime: number;
    mediaFile: MediaFile;

}

export function SubtitlePreview({ subtitles, currentTime, mediaFile }: SubtitlePreviewProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [videoReady, setVideoReady] = useState(false);

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

        if (audioEl.paused && !video.paused) {
            video.pause();
        } else if (!audioEl.paused && video.paused) {
            video.play().catch(() => {/* ignore autoplay issues */ });
        }
    }, [videoReady]);

    useEffect(() => {
        const audioEl = document.querySelector('audio');
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
    }, [syncPlayState, mediaFile.isVideo]);

    if (mediaFile.isVideo) {
        return (
            <div className="subtitle-preview">
                <div className="preview-video-wrapper">
                    <video
                        ref={videoRef}
                        muted
                        playsInline
                    />
                    {subtitleText && (
                        <div className="preview-subtitle" dir={direction} style={{ direction }} aria-live="polite">
                            {subtitleText}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Audio file: cinema screen
    return (
        <div className="subtitle-preview">
            <div className="preview-cinema">
                {subtitleText ? (
                    <div className="preview-subtitle cinema-subtitle" dir={direction} style={{ direction }} aria-live="polite">
                        {subtitleText}
                    </div>
                ) : (
                    <div className="preview-cinema-idle">
                        <span className="icon icon-xl">subtitles</span>
                    </div>
                )}
            </div>
        </div>
    );
}
