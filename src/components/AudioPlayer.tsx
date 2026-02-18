import { useRef, useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { formatDisplayTime } from '../utils';

export interface AudioPlayerHandle {
    seek: (time: number) => void;
    togglePlay: () => void;
}

interface AudioPlayerProps {
    audioPath: string;
    currentTime: number;
    duration: number; // Max duration to display
    mediaDuration?: number; // Actual media duration
    onTimeUpdate: (time: number) => void;
    onDurationChange: (duration: number) => void;
    filename?: string;
}

export const AudioPlayer = forwardRef<AudioPlayerHandle, AudioPlayerProps>(({
    audioPath,
    currentTime,
    duration,
    mediaDuration,
    onTimeUpdate,
    onDurationChange,
    filename
}, ref) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [volume, setVolume] = useState(1);

    useEffect(() => {
        if (audioRef.current && audioPath) {
            // Use custom media:// protocol for streaming
            // We encode the path component to handle special characters
            const safePath = encodeURIComponent(audioPath);
            audioRef.current.src = `media://${safePath}`;
        }
    }, [audioPath]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleTimeUpdate = () => {
            // Basic sync
            // If we are playing and reach end of audio, standard behavior stops.
            // But our timeline might be longer.
            // We rely on parent to update current time if we are scrolling in "ghost" zone.
            // But here we are source of truth when playing audio.
            onTimeUpdate(audio.currentTime);
        };
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

    // Handle "ghost" playback or seeking
    useEffect(() => {
        if (!audioRef.current) return;
        // If currentTime provided by parent is different from audio.currentTime
        // We sync audio to it.
        // BUT: if currentTime > audio.duration, audio can't seek there.
        // It stays at duration (ended).

        const audio = audioRef.current;
        const diff = Math.abs(audio.currentTime - currentTime);

        if (diff > 0.5) {
            // Need sync
            if (mediaDuration && currentTime > mediaDuration) {
                // We are in ghost zone
                if (!audio.paused) audio.pause();
                // We can't really seek audio there.
            } else if (Number.isFinite(audio.duration) && currentTime <= audio.duration) {
                audio.currentTime = currentTime;
            }
        }
    }, [currentTime, mediaDuration]);


    const togglePlay = useCallback(() => {
        if (!audioRef.current) return;

        if (mediaDuration && currentTime >= mediaDuration) {
            // Can't play past end
            // Optional: Restart from 0?
            audioRef.current.currentTime = 0;
            audioRef.current.play();
            setIsPlaying(true);
            return;
        }

        const playing = !audioRef.current.paused;
        if (playing) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!playing);
    }, [currentTime, mediaDuration]);

    const seek = useCallback((time: number) => {
        // Optimistic update
        onTimeUpdate(time);

        if (audioRef.current) {
            if (mediaDuration && time > mediaDuration) {
                // Ghost seek
                // Audio stays at end or pauses
                audioRef.current.pause();
                setIsPlaying(false);
            } else {
                audioRef.current.currentTime = time;
                if (!audioRef.current.paused) {
                    setIsPlaying(true);
                }
            }
        }
    }, [onTimeUpdate, mediaDuration]);

    useImperativeHandle(ref, () => ({
        seek,
        togglePlay
    }));

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

    return (
        <div className="audio-player-wrapper">
            {/* Audio Timeline Layer */}
            <div className="audio-timeline-layer">
                <div
                    className="player-progress"
                    onClick={handleProgressClick}
                    role="slider"
                    aria-label="Playback progress"
                    aria-valuenow={Math.round(currentTime)}
                    aria-valuemin={0}
                    aria-valuemax={Math.round(duration)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === 'ArrowLeft') { e.preventDefault(); skipBackward(); }
                        else if (e.key === 'ArrowRight') { e.preventDefault(); skipForward(); }
                    }}
                >
                    {/* Media Duration Marker */}
                    {mediaDuration && duration > mediaDuration && (
                        <div
                            className="progress-media-marker"
                            style={{
                                left: `${(mediaDuration / duration) * 100}%`,
                                position: 'absolute',
                                top: 0,
                                bottom: 0,
                                width: '2px',
                                backgroundColor: 'var(--color-warning)',
                                zIndex: 1,
                                opacity: 0.5
                            }}
                            title="End of Audio"
                        />
                    )}

                    <div
                        className="progress-filled"
                        style={{ width: `${(currentTime / duration) * 100}%` }}
                    />
                </div>
                <div className="player-times">
                    <div className="player-time left">{formatDisplayTime(currentTime)}</div>
                    {/* Filename centered between times */}
                    {filename && (
                        <div className="player-track-name" style={{
                            fontSize: '13px',
                            fontWeight: 500,
                            color: 'var(--color-text-secondary)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '300px',
                            textAlign: 'center'
                        }}>
                            {filename}
                        </div>
                    )}
                    <div className="player-time right">{formatDisplayTime(duration)}</div>
                </div>
            </div>

            {/* Controls Layer */}
            <div className="audio-player-controls">
                <audio ref={audioRef} />

                <div className="controls-spacer"></div>

                <div className="player-controls">
                    <button className="control-btn skip" onClick={skipBackward} title="Back 5s" aria-label="Skip backward 5 seconds">
                        <span className="icon">fast_rewind</span>
                    </button>

                    <button className="control-btn play" onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
                        <span className="icon">{isPlaying ? 'pause' : 'play_arrow'}</span>
                    </button>

                    <button className="control-btn skip" onClick={skipForward} title="Forward 5s" aria-label="Skip forward 5 seconds">
                        <span className="icon">fast_forward</span>
                    </button>
                </div>

                <div className="player-volume">
                    <span className="icon icon-sm volume-icon">{volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'}</span>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={volume}
                        onChange={handleVolumeChange}
                        className="volume-slider"
                        aria-label="Volume"
                    />
                </div>
            </div>
        </div>
    );
});
