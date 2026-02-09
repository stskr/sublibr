import type { ProcessingState } from '../types';

interface ProgressIndicatorProps {
    state: ProcessingState;
}

const STATUS_ICONS: Record<string, string> = {
    'idle': 'hourglass_empty',
    'extracting': 'audiotrack',
    'detecting-silences': 'graphic_eq',
    'splitting': 'content_cut',
    'transcribing': 'translate',
    'merging': 'merge',
    'done': 'check_circle',
    'error': 'error',
};

const STATUS_MESSAGES: Record<string, string> = {
    'idle': 'Ready',
    'extracting': 'Extracting audio...',
    'detecting-silences': 'Detecting silences...',
    'splitting': 'Splitting audio into chunks...',
    'transcribing': 'Transcribing with Gemini...',
    'merging': 'Merging subtitles...',
    'done': 'Complete!',
    'error': 'Error occurred',
};

export function ProgressIndicator({ state }: ProgressIndicatorProps) {
    const { status, progress, currentChunk, totalChunks, error } = state;

    if (status === 'idle' || status === 'done') {
        return null;
    }

    return (
        <div className={`progress-indicator ${status === 'error' ? 'error' : ''}`}>
            <div className="progress-header">
                <span className="progress-status">
                    <span className={`icon icon-sm ${status === 'transcribing' ? 'spin' : ''}`}>
                        {STATUS_ICONS[status] || 'sync'}
                    </span>
                    {STATUS_MESSAGES[status]}
                </span>
                {status === 'transcribing' && totalChunks && (
                    <span className="progress-chunks">
                        Chunk {currentChunk} of {totalChunks}
                    </span>
                )}
            </div>

            <div className="progress-bar-container">
                <div
                    className="progress-bar-fill"
                    style={{ width: `${progress}%` }}
                />
            </div>

            <div className="progress-percent">{Math.round(progress)}%</div>

            {error && (
                <div className="progress-error">
                    <span className="icon icon-sm">error_outline</span>
                    {error}
                </div>
            )}
        </div>
    );
}
