
import type { RecentFile } from '../types';
import { formatTimeAgo } from '../utils';

interface RecentFilesProps {
    files: RecentFile[];
    onLoadRecent: (file: RecentFile) => void;
}

export function RecentFiles({ files, onLoadRecent }: RecentFilesProps) {
    if (files.length === 0) return null;

    return (
        <div className="recent-files">
            <h3 className="recent-files-header">Recently Generated</h3>
            <div className="recent-files-list">
                {files.map((file) => (
                    <button
                        key={`${file.path}-${file.date}`}
                        className="recent-file-item"
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
                            </div>
                        </div>
                        <span className="icon icon-sm recent-file-arrow">chevron_right</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
