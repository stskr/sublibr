import type { ProcessingState } from '../types';

interface ProgressIndicatorProps {
    state: ProcessingState;
    providerLabel?: string;
    onRetry?: () => void;
    onDismiss?: () => void;
}

const STATUS_ICONS: Record<string, string> = {
    'idle': 'hourglass_empty',
    'extracting': 'audiotrack',
    'detecting-silences': 'graphic_eq',
    'splitting': 'content_cut',
    'transcribing': 'translate',
    'merging': 'merge',
    'healing': 'healing',
    'done': 'check_circle',
    'error': 'error',
};

const STATUS_MESSAGES: Record<string, string> = {
    'idle': 'Ready',
    'extracting': 'Extracting audio...',
    'detecting-silences': 'Detecting silences...',
    'splitting': 'Splitting audio into chunks...',
    'transcribing': 'Transcribing...',
    'merging': 'Merging subtitles...',
    'healing': 'Healing gaps...',
    'done': 'Complete!',
    'error': 'Error occurred',
};

export function ProgressIndicator({ state, providerLabel, onRetry, onDismiss }: ProgressIndicatorProps) {
    const { status, progress, currentChunk, totalChunks, error } = state;

    if (status === 'idle' || status === 'done') {
        return null;
    }

    const message = status === 'transcribing' && providerLabel
        ? `Transcribing with ${providerLabel}...`
        : STATUS_MESSAGES[status];

    return (
        <div className={`progress-indicator ${status === 'error' ? 'error' : ''}`} aria-live="polite">
            <div className="progress-header">
                <span className="progress-status">
                    <span className={`icon icon-sm ${status === 'transcribing' ? 'spin' : ''}`}>
                        {STATUS_ICONS[status] || 'sync'}
                    </span>
                    {message}
                </span>

            </div>

            <div
                className="progress-bar-container"
                role="progressbar"
                aria-valuenow={Math.round(progress)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Processing progress"
            >
                <div
                    className="progress-bar-fill"
                    style={{ width: `${progress}%` }}
                />
            </div>

            <div className="progress-footer">
                {status === 'transcribing' && totalChunks ? (
                    <span className="progress-chunks">
                        Chunk {currentChunk} of {totalChunks}
                    </span>
                ) : <div></div>}
                <div className="progress-percent">{Math.round(progress)}%</div>
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
