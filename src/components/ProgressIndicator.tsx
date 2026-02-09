import type { ProcessingState } from '../types';

interface ProgressIndicatorProps {
    state: ProcessingState;
}

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
                <span className="progress-status">{STATUS_MESSAGES[status]}</span>
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
                    {error}
                </div>
            )}
        </div>
    );
}
