import { useState, useCallback, useEffect } from 'react';
import { LatestProjects } from './RecentFiles';
import type { ProjectSummary } from '../types';

interface FileUploadProps {
    latestProjects: ProjectSummary[];
    onLoadProject: (project: ProjectSummary) => void;
    highlightedRecentIndex: number | null;
    onProcessFile: (path: string) => Promise<void>;
    onStartFromScratch: () => void;
    onRequestDelete: (project: ProjectSummary) => void;
    onDuplicateProject: (project: ProjectSummary) => void;
    onRenameProject: (project: ProjectSummary) => void;
    isAnalyzing: boolean;
    analyzingMessage?: string;
    error: string | null;
}

export function FileUpload({
    latestProjects,
    onLoadProject,
    highlightedRecentIndex,
    onProcessFile,
    onStartFromScratch,
    onRequestDelete,
    onDuplicateProject,
    onRenameProject,
    isAnalyzing,
    analyzingMessage = 'Analyzing file...',
    error: propsError
}: FileUploadProps) {
    const [isDragOver, setIsDragOver] = useState(false);

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

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        const file = e.dataTransfer.files[0];
        if (!file) return;

        let filePath = '';
        try {
            if (window.electronAPI?.getFilePath) {
                filePath = window.electronAPI.getFilePath(file);
            } else {
                filePath = (file as File & { path?: string }).path || '';
            }
        } catch (err) {
            console.error('Error getting file path:', err);
            filePath = (file as File & { path?: string }).path || '';
        }

        if (!filePath) return;
        if (window.electronAPI?.registerPath) {
            window.electronAPI.registerPath(filePath).then(() => {
                onProcessFile(filePath);
            }).catch(err => {
                console.error('Failed to register file path:', err);
                onProcessFile(filePath);
            });
        } else {
            onProcessFile(filePath);
        }
    }, [onProcessFile]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback(() => {
        setIsDragOver(false);
    }, []);

    const handleBrowse = async () => {
        if (!window.electronAPI) return;
        const filePath = await (window.electronAPI.openImportDialog ?? window.electronAPI.openFileDialog)();
        if (filePath) onProcessFile(filePath);
    };

    return (
        <div className="file-upload-container">
            <div className="home-top">
            <div
                className={`drop-zone ${isDragOver ? 'drag-over' : ''} ${isAnalyzing ? 'loading' : ''}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                role="button"
                tabIndex={0}
                aria-label="Drop a video, audio, subtitle, or Sublibr project, or browse"
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleBrowse(); }
                }}
            >
                {isAnalyzing ? (
                    <div className="loading-content">
                        <div className="spinner" />
                        <p>{analyzingMessage}</p>
                    </div>
                ) : (
                    <div className="upload-prompt">
                        <span className="icon icon-xl upload-icon">folder_open</span>
                        <h3>Drop a file here</h3>
                        <p className="upload-formats">
                            Video or audio (MP4, MOV, MP3, WAV…), subtitles (SRT, VTT, ASS), or a Sublibr project
                        </p>
                        <button className="btn-primary" onClick={handleBrowse}>
                            Browse files
                        </button>
                    </div>
                )}
            </div>

            <p className="home-scratch">
                <span className="home-scratch-or">or</span>
                {' '}
                <button
                    type="button"
                    className="home-scratch-link"
                    onClick={onStartFromScratch}
                    disabled={isAnalyzing}
                >
                    start from scratch
                </button>
            </p>

            {propsError && (
                <div className="error-message" role="alert">
                    <span className="icon icon-sm error-icon">error</span>
                    {propsError}
                </div>
            )}
            </div>

            <LatestProjects
                projects={latestProjects}
                onLoadProject={onLoadProject}
                onRequestDelete={onRequestDelete}
                onDuplicateProject={onDuplicateProject}
                onRenameProject={onRenameProject}
                highlightedIndex={highlightedRecentIndex}
            />
        </div>
    );
}
