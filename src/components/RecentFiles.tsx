
import type { RecentFile } from '../types';
import { formatTimeAgo } from '../utils';

interface RecentFilesProps {
    files: RecentFile[];
    onLoadRecent: (file: RecentFile) => void;
    onClearRecents: () => void;
    onClearCache: () => void;
    highlightedIndex: number | null;
}

export function RecentFiles({ files, onLoadRecent, onClearRecents, onClearCache, highlightedIndex }: RecentFilesProps) {
    if (files.length === 0) return null;

    return (
        <div className="recent-files">
            <div className="recent-files-header-row">
                <h3 className="recent-files-header">Recently Generated</h3>
                <div className="recent-files-actions">
                    <button className="recent-clear-btn" onClick={onClearRecents} title="Remove all items from the recents list" aria-label="Clear recent files list">
                        Clear List
                    </button>
                    <button className="recent-clear-btn" onClick={onClearCache} title="Delete cached subtitles (does not affect exported files)" aria-label="Clear subtitle cache">
                        Clear Cache
                    </button>
                </div>
            </div>
            <div className="recent-files-list" role="list" aria-label="Recent files">
                {files.map((file, index) => (
                    <button
                        key={`${file.path}-${file.date}`}
                        className={`recent-file-item ${highlightedIndex === index ? 'highlighted' : ''}`}
                        onClick={() => onLoadRecent(file)}
                        title={file.path}
                    >
                        <div className="recent-file-icon">
                            <span className="icon icon-sm">history</span>
                        </div>
                        <div className="recent-file-info">
                            <div className="recent-file-name">{file.name}</div>
                            <div className="recent-file-meta">
                                {file.lastAction === 'generated' ? 'Generated' : 'Opened'} • {formatTimeAgo(file.date)}
                                {file.subtitleCount != null && (
                                    <span className="recent-file-cached"> • {file.subtitleCount} subs cached</span>
                                )}
                            </div>
                        </div>
                        <span className="icon icon-sm recent-file-arrow">chevron_right</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
