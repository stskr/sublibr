import { useRef, useState, useEffect, useCallback } from 'react';
import { formatDisplayTime } from '../utils';

interface AudioPlayerProps {
    audioPath: string;
    currentTime: number;
    duration: number;
    onTimeUpdate: (time: number) => void;
    onDurationChange: (duration: number) => void;
}

export function AudioPlayer({
    audioPath,
    currentTime,
    duration,
    onTimeUpdate,
    onDurationChange
}: AudioPlayerProps) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [volume, setVolume] = useState(1);

    useEffect(() => {
        const loadAudio = async () => {
            if (audioRef.current && audioPath) {
                try {
                    // Use IPC to read file as data URL to avoid file:// protocol restrictions
                    if (window.electronAPI) {
                        const dataUrl = await window.electronAPI.readFileAsDataUrl(audioPath);
                        audioRef.current.src = dataUrl;
                    } else {
                        // Fallback for browser mode (won't work)
                        console.warn('Audio playback requires Electron');
                    }
                } catch (error) {
                    console.error('Failed to load audio:', error);
                }
            }
        };
        loadAudio();
    }, [audioPath]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleTimeUpdate = () => onTimeUpdate(audio.currentTime);
        const handleDurationChange = () => onDurationChange(audio.duration);
        const handleEnded = () => setIsPlaying(false);

        audio.addEventListener('timeupdate', handleTimeUpdate);
        audio.addEventListener('durationchange', handleDurationChange);
        audio.addEventListener('ended', handleEnded);

        return () => {
            audio.removeEventListener('timeupdate', handleTimeUpdate);
            audio.removeEventListener('durationchange', handleDurationChange);
            audio.removeEventListener('ended', handleEnded);
        };
    }, [onTimeUpdate, onDurationChange]);

    const togglePlay = useCallback(() => {
        if (!audioRef.current) return;

        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    }, [isPlaying]);

    const seek = useCallback((time: number) => {
        if (audioRef.current) {
            audioRef.current.currentTime = time;
            onTimeUpdate(time);
        }
    }, [onTimeUpdate]);

    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = x / rect.width;
        seek(percent * duration);
    };

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVolume = parseFloat(e.target.value);
        setVolume(newVolume);
        if (audioRef.current) {
            audioRef.current.volume = newVolume;
        }
    };

    const skipBackward = () => seek(Math.max(0, currentTime - 5));
    const skipForward = () => seek(Math.min(duration, currentTime + 5));

    // Expose seek for external use
    useEffect(() => {
        (window as { seekAudio?: (time: number) => void }).seekAudio = seek;
    }, [seek]);

    return (
        <div className="audio-player">
            <audio ref={audioRef} />

            <div className="player-controls">
                <button className="control-btn skip" onClick={skipBackward} title="Back 5s">
                    ⏪
                </button>

                <button className="control-btn play" onClick={togglePlay}>
                    {isPlaying ? '⏸' : '▶'}
                </button>

                <button className="control-btn skip" onClick={skipForward} title="Forward 5s">
                    ⏩
                </button>
            </div>

            <div className="player-progress" onClick={handleProgressClick}>
                <div
                    className="progress-filled"
                    style={{ width: `${(currentTime / duration) * 100}%` }}
                />
            </div>

            <div className="player-time">
                {formatDisplayTime(currentTime)} / {formatDisplayTime(duration)}
            </div>

            <div className="player-volume">
                <span className="volume-icon">{volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}</span>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={volume}
                    onChange={handleVolumeChange}
                    className="volume-slider"
                />
            </div>
        </div>
    );
}
