import { useState, useEffect, useCallback } from 'react';
import type { MediaFile, RecentFile, Subtitle, SubtitleVersion } from '../types';
import { isVideoFile, formatFileSize } from '../utils';

const MAX_RECENT_FILES = 10;

export function useMediaManager() {
    const [mediaFile, setMediaFile] = useState<MediaFile | null>(null);
    const [audioPath, setAudioPath] = useState<string | null>(null);
    const [duration, setDuration] = useState(0);
    const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
    const [highlightedRecentIndex, setHighlightedRecentIndex] = useState<number | null>(null);
    const [processingError, setProcessingError] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    useEffect(() => {
        async function loadRecents() {
            if (!window.electronAPI) return;
            const savedRecents = await window.electronAPI.getStoreValue('recent-files') as RecentFile[] | null;
            if (savedRecents?.length) {
                setRecentFiles(savedRecents);
            }
        }
        loadRecents();
    }, []);

    const addToRecents = useCallback((file: MediaFile, action: 'generated' | 'opened', subtitleCount?: number) => {
        const newRecent: RecentFile = {
            path: file.path,
            name: file.name,
            date: Date.now(),
            lastAction: action,
            ...(subtitleCount != null && { subtitleCount }),
        };

        setRecentFiles(prev => {
            const filtered = prev.filter(f => f.path !== file.path);
            const updated = [newRecent, ...filtered].slice(0, MAX_RECENT_FILES);
            if (window.electronAPI) {
                window.electronAPI.setStoreValue('recent-files', updated).catch(() => { });
            }
            return updated;
        });
    }, []);

    const handleClearRecents = useCallback(async () => {
        setRecentFiles([]);
        if (window.electronAPI) {
            await window.electronAPI.setStoreValue('recent-files', []);
        }
    }, []);

    const handleClearCache = useCallback(async () => {
        if (window.electronAPI) {
            await window.electronAPI.deleteStoreValue('subtitle-cache');
            await window.electronAPI.deleteStoreValue('subtitle-versions');
        }
        setRecentFiles(prev => {
            const updated = prev.map(f => {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { subtitleCount: _, ...rest } = f;
                return rest;
            });
            if (window.electronAPI) {
                window.electronAPI.setStoreValue('recent-files', updated).catch(() => { });
            }
            return updated;
        });
    }, []);

    const handleLoadRecent = useCallback(async (recent: RecentFile) => {
        if (!window.electronAPI) return null;

        try {
            await window.electronAPI.registerPath(recent.path);
            const info = await window.electronAPI.getFileInfo(recent.path);
            const fileDuration = await window.electronAPI.getDuration(recent.path);

            const file: MediaFile = {
                path: info.path,
                name: info.name,
                ext: info.ext,
                size: info.size,
                duration: fileDuration,
                isVideo: isVideoFile(info.ext),
            };

            setMediaFile(file);
            setDuration(fileDuration);
            setAudioPath(file.path);

            const cache = (await window.electronAPI.getStoreValue('subtitle-cache') || {}) as Record<string, Subtitle[]>;
            let subsToLoad = cache[recent.path] || [];
            let hasSubtitles = subsToLoad.length > 0;

            const versionCache = (await window.electronAPI.getStoreValue('subtitle-versions') || {}) as Record<string, SubtitleVersion[]>;
            const cachedVersions = versionCache[recent.path] || [];

            if (cachedVersions.length > 0 && !hasSubtitles) {
                const latestVersion = cachedVersions[cachedVersions.length - 1];
                subsToLoad = latestVersion.subtitles;
                hasSubtitles = true;
            }

            return { file, hasSubtitles, cachedVersions, subsToLoad };
        } catch (error) {
            console.error('Failed to load recent file:', error);
            return null;
        }
    }, []);

    const processFileCore = useCallback(async (filePath: string) => {
        if (!window.electronAPI) throw new Error('File upload requires Electron.');

        const info = await window.electronAPI.getFileInfo(filePath);
        if (info.size > 3 * 1024 * 1024 * 1024) {
            throw new Error(`File too large. Maximum size is 3GB. Your file: ${formatFileSize(info.size)}`);
        }

        const fileDuration = await window.electronAPI.getDuration(filePath);
        const file: MediaFile = {
            path: info.path,
            name: info.name,
            ext: info.ext,
            size: info.size,
            duration: fileDuration,
            isVideo: isVideoFile(info.ext),
        };

        setMediaFile(file);
        setDuration(fileDuration);
        setAudioPath(file.path);

        let cachedVersions: SubtitleVersion[] = [];
        let subsToLoad: Subtitle[] = [];
        let hasSubtitles = false;

        try {
            const store = await window.electronAPI.getStoreValue('subtitle-versions') as Record<string, SubtitleVersion[]>;
            const existing = store?.[file.path];

            if (existing && existing.length > 0) {
                cachedVersions = existing;
                subsToLoad = existing[existing.length - 1].subtitles;
                hasSubtitles = true;
            }
        } catch (err) {
            console.error('Failed to load version history:', err);
        }

        addToRecents(file, 'opened');
        return { file, hasSubtitles, cachedVersions, subsToLoad };
    }, [addToRecents]);

    const processFile = useCallback(async (filePath: string) => {
        setIsAnalyzing(true);
        setProcessingError(null);
        try {
            return await processFileCore(filePath);
        } catch (err) {
            setProcessingError(err instanceof Error ? err.message : 'Failed to process file');
            return null;
        } finally {
            setIsAnalyzing(false);
        }
    }, [processFileCore]);

    const handleFileSelect = useCallback(async (file: MediaFile) => {
        setIsAnalyzing(true);
        setProcessingError(null);
        try {
            return await processFileCore(file.path);
        } catch (err) {
            setProcessingError(err instanceof Error ? err.message : 'Failed to load selected file');
            return null;
        } finally {
            setIsAnalyzing(false);
        }
    }, [processFileCore]);

    const handleNavigateRecentUp = useCallback(() => {
        if (mediaFile || !recentFiles.length) return;
        setHighlightedRecentIndex(prev => {
            if (prev === null) return recentFiles.length - 1;
            return (prev - 1 + recentFiles.length) % recentFiles.length;
        });
    }, [mediaFile, recentFiles.length]);

    const handleNavigateRecentDown = useCallback(() => {
        if (mediaFile || !recentFiles.length) return;
        setHighlightedRecentIndex(prev => {
            if (prev === null) return 0;
            return (prev + 1) % recentFiles.length;
        });
    }, [mediaFile, recentFiles.length]);

    const clearMedia = useCallback(() => {
        setMediaFile(null);
        setAudioPath(null);
        setDuration(0);
        setProcessingError(null);
        setIsAnalyzing(false);
        setHighlightedRecentIndex(null);
    }, []);

    return {
        mediaFile,
        audioPath,
        duration,
        recentFiles,
        highlightedRecentIndex,
        processingError,
        isAnalyzing,
        setDuration,
        setHighlightedRecentIndex,
        addToRecents,
        handleClearRecents,
        handleClearCache,
        handleLoadRecent,
        processFile,
        handleFileSelect,
        handleNavigateRecentUp,
        handleNavigateRecentDown,
        clearMedia
    };
}
