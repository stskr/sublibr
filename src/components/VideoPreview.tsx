import { useRef, useEffect, useState } from 'react';
import type { Subtitle } from '../types';

interface VideoPreviewProps {
    videoPath: string;
    subtitles: Subtitle[];
    onClose: () => void;
}

export function VideoPreview({ videoPath, subtitles, onClose }: VideoPreviewProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [currentSubtitle, setCurrentSubtitle] = useState<string>('');
    const [isPlaying, setIsPlaying] = useState(false);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handleTimeUpdate = () => {
            const time = video.currentTime;
            const activeSub = subtitles.find(
                sub => time >= sub.startTime && time <= sub.endTime
            );
            setCurrentSubtitle(activeSub?.text || '');
        };

        const handleEnded = () => setIsPlaying(false);

        video.addEventListener('timeupdate', handleTimeUpdate);
        video.addEventListener('ended', handleEnded);

        return () => {
            video.removeEventListener('timeupdate', handleTimeUpdate);
            video.removeEventListener('ended', handleEnded);
        };
    }, [subtitles]);

    const togglePlay = () => {
        if (!videoRef.current) return;

        if (isPlaying) {
            videoRef.current.pause();
        } else {
            videoRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose();
        } else if (e.key === ' ') {
            e.preventDefault();
            togglePlay();
        }
    };

    return (
        <div className="video-preview-overlay" onKeyDown={handleKeyDown} tabIndex={0}>
            <div className="video-preview-container">
                <button className="close-preview-btn" onClick={onClose}>
                    <span className="icon">close</span>
                </button>

                <div className="video-wrapper">
                    <video
                        ref={videoRef}
                        src={`file://${videoPath}`}
                        onClick={togglePlay}
                    />

                    {currentSubtitle && (
                        <div className="video-subtitle">
                            {currentSubtitle}
                        </div>
                    )}
                </div>

                <div className="preview-controls">
                    <button className="btn-primary" onClick={togglePlay}>
                        <span className="icon">{isPlaying ? 'pause' : 'play_arrow'}</span>
                        {isPlaying ? 'Pause' : 'Play'}
                    </button>
                </div>
            </div>
        </div>
    );
}
