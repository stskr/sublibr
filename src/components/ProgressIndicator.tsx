import { useState } from 'react';
import type { ProcessingState } from '../types';

interface ProgressIndicatorProps {
    state: ProcessingState;
    providerLabel?: string;
    onRetry?: () => void;
    onDismiss?: () => void;
    onPause?: () => void;
    onResume?: () => void;
    onStop?: () => void;
    onSkipHealing?: () => void;
    /** True once the checkpoint is ready and resume is safe to call */
    canResume?: boolean;
    /** True while a pause request is pending but in-flight API calls haven't finished yet */
    isPausing?: boolean;
}

const STATUS_ICONS: Record<string, string> = {
    'idle': 'hourglass_empty',
    'extracting': 'audiotrack',
    'detecting-silences': 'graphic_eq',
    'splitting': 'content_cut',
    'transcribing': 'translate',
    'paused': 'pause_circle',
    'merging': 'merge',
    'healing': 'healing',
    'rendering': 'movie',
    'done': 'check_circle',
    'error': 'error',
};

const STATUS_MESSAGES: Record<string, string> = {
    'idle': 'Ready',
    'extracting': 'Extracting audio...',
    'detecting-silences': 'Detecting silences...',
    'splitting': 'Splitting audio into chunks...',
    'transcribing': 'Transcribing...',
    'paused': 'Paused',
    'merging': 'Merging subtitles...',
    'healing': 'Healing gaps...',
    'rendering': 'Burning subtitles into video...',
    'done': 'Complete!',
    'error': 'Error occurred',
};

// Stages where real progress cannot be measured — show indeterminate animation instead.
const INDETERMINATE_STATUSES = new Set(['detecting-silences', 'splitting', 'merging']);

export function ProgressIndicator({ state, providerLabel, onRetry, onDismiss, onPause, onResume, onStop, onSkipHealing, canResume, isPausing }: ProgressIndicatorProps) {
    const { status, progress, currentChunk, totalChunks, error, warning } = state;

    // Local two-step confirmation state for Stop
    const [confirmingStop, setConfirmingStop] = useState(false);

    if (status === 'idle' || (status === 'done' && !warning)) {
        return null;
    }

    if (status === 'done' && warning) {
        return (
            <div className="progress-indicator" aria-live="polite">
                <div className="progress-error" role="alert">
                    <div className="progress-error-message">
                        <span className="icon icon-sm">warning</span>
                        {warning}
                    </div>
                </div>
            </div>
        );
    }

    const message = status === 'transcribing' && providerLabel
        ? `Transcribing with ${providerLabel}...`
        : STATUS_MESSAGES[status] ?? status;

    const showPause = status === 'transcribing' && onPause && !isPausing;
    const showPausingIndicator = status === 'transcribing' && isPausing;
    const showResume = status === 'paused' && onResume;
    const resumeReady = canResume !== false;
    const showStop = (status === 'transcribing' || status === 'paused' || status === 'extracting') && onStop;
    const showSkipHealing = status === 'healing' && onSkipHealing;

    const isIndeterminate = INDETERMINATE_STATUSES.has(status);

    const handleStopClick = () => {
        if (confirmingStop) {
            setConfirmingStop(false);
            onStop?.();
        } else {
            setConfirmingStop(true);
        }
    };

    const hasControls = showPause || showPausingIndicator || showResume || showStop || showSkipHealing;

    return (
        <div className={`progress-indicator ${status === 'error' ? 'error' : ''}`} aria-live="polite">
            {/* Status row */}
            <div className="progress-header">
                <span className="progress-status" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="icon icon-sm">
                        {STATUS_ICONS[status] || 'sync'}
                    </span>
                    {message}
                </span>
            </div>

            {/* Progress bar */}
            <div
                className="progress-bar-container"
                role="progressbar"
                aria-valuenow={isIndeterminate ? undefined : Math.round(progress)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Processing progress"
            >
                <div
                    className={`progress-bar-fill${isIndeterminate ? ' indeterminate' : ''}`}
                    style={{
                        width: isIndeterminate ? '100%' : `${progress}%`,
                        ...(status === 'paused' ? { opacity: 0.6 } : {}),
                    }}
                />
            </div>

            {/* Controls row — below the bar */}
            {hasControls && (
                <div className="progress-controls">
                    {/* Skip healing */}
                    {showSkipHealing && (
                        <button
                            className="btn btn-sm btn-ghost"
                            onClick={onSkipHealing}
                            aria-label="Skip healing and finish"
                            title="Skip healing gaps and finish with current subtitles"
                        >
                            <span className="icon icon-sm">skip_next</span>
                            Skip healing
                        </button>
                    )}

                    {/* Pause / Pausing... */}
                    {showPause && (
                        <button
                            className="btn btn-sm btn-ghost"
                            onClick={onPause}
                            aria-label="Pause transcription"
                            title="Pause — you can resume later"
                        >
                            <span className="icon icon-sm">pause</span>
                            Pause
                        </button>
                    )}
                    {showPausingIndicator && (
                        <button
                            className="btn btn-sm btn-ghost"
                            disabled
                            aria-label="Pausing transcription"
                            title="Waiting for current chunk to finish before pausing"
                            style={{ opacity: 0.6, cursor: 'not-allowed' }}
                        >
                            <span className="icon icon-sm">hourglass_empty</span>
                            Pausing…
                        </button>
                    )}

                    {/* Resume */}
                    {showResume && (
                        <button
                            className="btn btn-sm btn-accent"
                            onClick={onResume}
                            disabled={!resumeReady}
                            aria-label="Resume transcription"
                            title={resumeReady ? 'Continue from where you left off' : 'Saving checkpoint, please wait…'}
                            style={!resumeReady ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                        >
                            <span className="icon icon-sm">{resumeReady ? 'play_arrow' : 'hourglass_empty'}</span>
                            {resumeReady ? 'Resume' : 'Saving…'}
                        </button>
                    )}

                    {/* Stop — two-step confirmation */}
                    {showStop && (
                        confirmingStop ? (
                            <>
                                <button
                                    className="btn btn-sm btn-ghost"
                                    onClick={handleStopClick}
                                    aria-label="Confirm stop processing"
                                    style={{ color: 'var(--color-error, #f87171)' }}
                                >
                                    <span className="icon icon-sm">stop</span>
                                    Confirm stop
                                </button>
                                <button
                                    className="btn btn-sm btn-ghost"
                                    onClick={() => setConfirmingStop(false)}
                                    aria-label="Keep going"
                                >
                                    Keep going
                                </button>
                            </>
                        ) : (
                            <button
                                className="btn btn-sm btn-ghost"
                                onClick={handleStopClick}
                                aria-label="Stop processing"
                                title="Stop and discard progress"
                                style={{ color: 'var(--color-error, #f87171)' }}
                            >
                                <span className="icon icon-sm">stop</span>
                                Stop
                            </button>
                        )
                    )}
                </div>
            )}

            {/* Footer: chunk info + percent */}
            <div className="progress-footer">
                {(status === 'transcribing' || status === 'paused') && totalChunks ? (
                    <span className="progress-chunks">
                        {status === 'paused' ? 'Paused — ' : ''}Chunk {currentChunk} of {totalChunks}
                        {status === 'paused' && (resumeReady ? ' — click Resume to continue' : ' — saving checkpoint…')}
                    </span>
                ) : status === 'healing' && totalChunks ? (
                    <span className="progress-chunks">
                        Gap {currentChunk} of {totalChunks}
                    </span>
                ) : <div />}
                {!isIndeterminate && (
                    <div className="progress-percent">{Math.round(progress)}%</div>
                )}
            </div>

            {error && (
                <div className="progress-error" role="alert">
                    <div className="progress-error-message">
                        <span className="icon icon-sm">error_outline</span>
                        {error}
                    </div>
                    <div className="progress-error-actions">
                        {onRetry && (
                            <button className="btn btn-sm btn-accent" onClick={onRetry} aria-label="Retry generation">
                                <span className="icon icon-sm">refresh</span>
                                Retry
                            </button>
                        )}
                        {onDismiss && (
                            <button className="btn btn-sm btn-ghost" onClick={onDismiss} aria-label="Dismiss error">
                                Dismiss
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
