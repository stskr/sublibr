import { useState, useCallback, useEffect } from 'react';
import { RecentFiles } from './RecentFiles';
import type { MediaFile, AppSettings, RecentFile } from '../types';

interface FileUploadProps {
    settings: AppSettings;
    onFileSelect: (file: MediaFile) => void;
    recentFiles: RecentFile[];
    onLoadRecent: (file: RecentFile) => void;
    onClearRecents: () => void;
    highlightedRecentIndex: number | null;
    onProcessFile: (path: string) => Promise<void>;
    isAnalyzing: boolean;
    error: string | null;
}


export function FileUpload({
    settings,
    recentFiles,
    onLoadRecent,
    onClearRecents,
    highlightedRecentIndex,
    onProcessFile,
    isAnalyzing,
    error: propsError
}: FileUploadProps) {
    const [isDragOver, setIsDragOver] = useState(false);

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

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        // Check API key availability
        const activeProvider = settings.activeProvider;
        const config = settings.providers[activeProvider];
        const hasKey = config?.apiKey && config.apiKey.trim().length > 0;

        if (!hasKey) return;

        const file = e.dataTransfer.files[0];
        if (file) {
            let filePath: string = '';
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

            if (filePath) {
                if (window.electronAPI?.registerPath) {
                    window.electronAPI.registerPath(filePath).then(() => {
                        onProcessFile(filePath);
                    }).catch(err => {
                        console.error('Failed to register file path:', err);
                    });
                } else {
                    onProcessFile(filePath);
                }
            }
        }
    }, [onProcessFile, settings]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback(() => {
        setIsDragOver(false);
    }, []);

    const handleBrowse = async () => {
        if (!window.electronAPI) return;
        const filePath = await window.electronAPI.openFileDialog();
        if (filePath) {
            onProcessFile(filePath);
        }
    };

    const activeConfig = settings.providers[settings.activeProvider];
    const hasApiKey = activeConfig.apiKey && activeConfig.apiKey.trim().length > 0;

    return (
        <div className="file-upload-container">
            {/* API Key Warning */}
            {!hasApiKey && (
                <div className="api-key-warning" role="alert">
                    <span className="icon icon-sm warning-icon">warning</span>
                    <span>Please add your API key in Settings before uploading files</span>
                </div>
            )}

            <div
                className={`drop-zone ${isDragOver ? 'drag-over' : ''} ${isAnalyzing ? 'loading' : ''} ${!hasApiKey ? 'disabled' : ''}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                role="button"
                tabIndex={0}
                aria-label="Drop audio or video file, or press to browse"
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleBrowse(); }
                }}
            >
                {isAnalyzing ? (
                    <div className="loading-content">
                        <div className="spinner" />
                        <p>Analyzing file...</p>
                    </div>
                ) : (
                    <div className="upload-prompt">
                        <span className="icon icon-xl upload-icon">folder_open</span>
                        <h3>Drop your audio or video file here</h3>
                        <p>or</p>
                        <button className="btn-primary" onClick={handleBrowse} disabled={!hasApiKey}>
                            Browse Files
                        </button>

                        <div className="upload-notes">
                            <div className="upload-note">
                                <span className="icon icon-sm">check_circle</span>
                                <span>Supports MP4, MKV, MOV, MP3, WAV, and more (Max 3GB)</span>
                            </div>
                            <div className="upload-note">
                                <span className="icon icon-sm">info</span>
                                <span>For best results, use smaller files. Larger files take longer and cost more.</span>
                            </div>
                            <div className="upload-note">
                                <span className="icon icon-sm">auto_awesome</span>
                                <span>Best quality: Gemini 2.5 Pro or Claude Sonnet. Lower cost: Gemini 2.5 Flash or GPT-4o Mini.</span>
                            </div>
                            <div className="upload-note">
                                <span className="icon icon-sm">redeem</span>
                                <span>Google AI Studio offers a free tier with no payment required. <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Get a free API key</a></span>
                            </div>
                            <div className="upload-note disclaimer-note">
                                <span className="icon icon-sm">gavel</span>
                                <span>
                                    By using this service, you acknowledge that AI-generated results may vary in accuracy. Data is processed via your selected provider (OpenAI or Google Gemini).
                                    We value your privacy: no tracking is used, and data collection is limited to optional usability surveys or marketing updates you explicitly approve.
                                    This software is provided "as is"—the developer assumes no liability for outcomes, and use is at the user's sole responsibility.
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {propsError && (
                <div className="error-message" role="alert">
                    <span className="icon icon-sm error-icon">error</span>
                    {propsError}
                </div>
            )}

            <RecentFiles
                files={recentFiles}
                onLoadRecent={onLoadRecent}
                onClearRecents={onClearRecents}
                highlightedIndex={highlightedRecentIndex}
            />
        </div>
    );
}
