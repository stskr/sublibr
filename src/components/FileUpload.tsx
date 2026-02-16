import { useState, useCallback, useEffect } from 'react';
import { formatFileSize, isVideoFile, estimateCost } from '../utils';
import { RecentFiles } from './RecentFiles';
import type { MediaFile, AppSettings, RecentFile } from '../types';

interface FileUploadProps {
    settings: AppSettings;
    onFileSelect: (file: MediaFile) => void;
    recentFiles: RecentFile[];
    onLoadRecent: (file: RecentFile) => void;
}


const MAX_SIZE = 1024 * 1024 * 1024; // 1GB
const MAX_DURATION = 2 * 60 * 60; // 2 hours

export function FileUpload({ settings, onFileSelect, recentFiles, onLoadRecent }: FileUploadProps) {
    const [isDragOver, setIsDragOver] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fileInfo, setFileInfo] = useState<MediaFile | null>(null);
    // Prevent default browser behavior of opening dropped files
    useEffect(() => {
        const preventDefaults = (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
        };
        document.addEventListener('dragover', preventDefaults);
        document.addEventListener('drop', preventDefaults);
        return () => {
            document.removeEventListener('dragover', preventDefaults);
            document.removeEventListener('drop', preventDefaults);
        };
    }, []);

    const processFile = useCallback(async (filePath: string) => {
        setLoading(true);
        setError(null);

        try {
            // Guard for browser mode
            if (!window.electronAPI) {
                throw new Error('File upload requires Electron. Please run the app in Electron.');
            }

            const info = await window.electronAPI.getFileInfo(filePath);

            // Validate size
            if (info.size > MAX_SIZE) {
                throw new Error(`File too large. Maximum size is 1GB. Your file: ${formatFileSize(info.size)}`);
            }

            // Get duration
            const duration = await window.electronAPI.getDuration(filePath);

            // Validate duration
            if (duration > MAX_DURATION) {
                throw new Error(`File too long. Maximum duration is 2 hours. Your file: ${Math.floor(duration / 60)} minutes`);
            }

            const mediaFile: MediaFile = {
                path: info.path,
                name: info.name,
                ext: info.ext,
                size: info.size,
                duration,
                isVideo: isVideoFile(info.ext),
            };

            setFileInfo(mediaFile);
            onFileSelect(mediaFile);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to process file');
        } finally {
            setLoading(false);
        }
    }, [onFileSelect]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);

        const file = e.dataTransfer.files[0];
        if (file) {
            const filePath = (file as File & { path?: string }).path;
            if (filePath) {
                processFile(filePath);
            }
        }
    }, [processFile]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback(() => {
        setIsDragOver(false);
    }, []);

    const handleBrowse = async () => {
        if (!window.electronAPI) {
            setError('File browsing requires Electron. Please run the app in Electron.');
            return;
        }
        const filePath = await window.electronAPI.openFileDialog();
        if (filePath) {
            processFile(filePath);
        }
    };

    const activeConfig = settings.providers[settings.activeProvider];
    const costEstimate = fileInfo ? estimateCost(fileInfo.duration, activeConfig.model) : null;

    const hasApiKey = activeConfig.apiKey && activeConfig.apiKey.trim().length > 0;

    return (
        <div className="file-upload-container">
            {/* API Key Warning */}
            {!hasApiKey && (
                <div className="api-key-warning">
                    <span className="icon icon-sm warning-icon">warning</span>
                    <span>Please add your API key in Settings before uploading files</span>
                </div>
            )}

            <div
                className={`drop-zone ${isDragOver ? 'drag-over' : ''} ${loading ? 'loading' : ''} ${!hasApiKey ? 'disabled' : ''}`}
                onDrop={hasApiKey ? handleDrop : (e) => e.preventDefault()}
                onDragOver={hasApiKey ? handleDragOver : (e) => e.preventDefault()}
                onDragLeave={handleDragLeave}
            >
                {loading ? (
                    <div className="loading-content">
                        <div className="spinner" />
                        <p>Analyzing file...</p>
                    </div>
                ) : fileInfo ? (
                    <div className="file-info">
                        <span className="icon icon-lg file-icon">{fileInfo.isVideo ? 'movie' : 'music_note'}</span>
                        <div className="file-details">
                            <h3>{fileInfo.name}</h3>
                            <p>
                                {formatFileSize(fileInfo.size)} • {Math.floor(fileInfo.duration / 60)}m {Math.floor(fileInfo.duration % 60)}s
                            </p>
                        </div>
                        <button className="btn-secondary change-file" onClick={handleBrowse}>
                            Change
                        </button>
                    </div>
                ) : (
                    <div className="upload-prompt">
                        <span className="icon icon-xl upload-icon">folder_open</span>
                        <h3>Drop your audio or video file here</h3>
                        <p>or</p>
                        <button className="btn-primary" onClick={handleBrowse} disabled={!hasApiKey}>
                            Browse Files
                        </button>
                        <p className="upload-hint">
                            Supports MP4, MKV, MOV, MP3, WAV, and more<br />
                            Max 1GB, up to 2 hours
                        </p>
                    </div>
                )}
            </div>

            {error && (
                <div className="error-message">
                    <span className="icon icon-sm error-icon">error</span>
                    {error}
                </div>
            )}

            {costEstimate && fileInfo && (
                <div className="cost-estimate">
                    <h4>Estimated Processing</h4>
                    <div className="cost-details">
                        <div className="cost-item">
                            <span className="cost-label">Chunks</span>
                            <span className="cost-value">{costEstimate.chunks}</span>
                        </div>
                        <div className="cost-item">
                            <span className="cost-label">API Calls</span>
                            <span className="cost-value">{costEstimate.chunks}</span>
                        </div>
                        <div className="cost-item">
                            <span className="cost-label">Est. Cost</span>
                            <span className="cost-value">${costEstimate.estimatedCostUSD.toFixed(4)}</span>
                        </div>
                    </div>
                </div>
            )}

            <RecentFiles files={recentFiles} onLoadRecent={onLoadRecent} />
        </div>
    );
}
