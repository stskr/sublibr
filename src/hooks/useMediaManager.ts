import { useState, useEffect, useCallback } from 'react';
import type { LoadedProject, MediaFile, ProjectSummary, Subtitle, SubtitleVersion } from '../types';
import { formatFileSize, isSupportedFile, isVideoFile } from '../utils';

const MAX_MEDIA_BYTES = 3 * 1024 * 1024 * 1024;
const SUBTITLE_EXTS = new Set(['.srt', '.vtt', '.ass', '.ssa']);

function projectFromLoaded(loaded: LoadedProject) {
    return { dir: loaded.dir, id: loaded.manifest.id, name: loaded.manifest.name };
}

function editorStateFromLoaded(loaded: LoadedProject) {
    const versions = (loaded.versions || []) as SubtitleVersion[];
    let subsToLoad = (loaded.subtitles || []) as Subtitle[];
    let hasSubtitles = subsToLoad.length > 0;
    if (versions.length > 0 && !hasSubtitles) {
        subsToLoad = versions[versions.length - 1].subtitles;
        hasSubtitles = true;
    }
    return { cachedVersions: versions, subsToLoad, hasSubtitles };
}

export type OpenedProject = {
    file: MediaFile | null;
    project: { dir: string; id: string; name: string };
    hasSubtitles: boolean;
    cachedVersions: SubtitleVersion[];
    subsToLoad: Subtitle[];
    missingMedia: boolean;
    missingMediaName: string | null;
    subtitleImportPath?: string;
};

export function useMediaManager() {
    const [currentProject, setCurrentProject] = useState<{ dir: string; id: string; name: string } | null>(null);
    const [mediaFile, setMediaFile] = useState<MediaFile | null>(null);
    const [audioPath, setAudioPath] = useState<string | null>(null);
    const [duration, setDuration] = useState(0);
    const [latestProjects, setLatestProjects] = useState<ProjectSummary[]>([]);
    const [highlightedRecentIndex, setHighlightedRecentIndex] = useState<number | null>(null);
    const [processingError, setProcessingError] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analyzingMessage, setAnalyzingMessage] = useState('Analyzing file...');
    const [pendingMissing, setPendingMissing] = useState<{ dir: string; name: string } | null>(null);
    const [deleteCandidate, setDeleteCandidate] = useState<ProjectSummary | null>(null);
    const [deleteStep, setDeleteStep] = useState(0);

    const refreshProjects = useCallback(async () => {
        if (!window.electronAPI?.listProjects) return;
        try {
            const list = await window.electronAPI.listProjects();
            setLatestProjects(list);
        } catch (error) {
            console.error('Failed to list projects:', error);
        }
    }, []);

    useEffect(() => {
        refreshProjects();
    }, [refreshProjects]);

    const inspectMedia = useCallback(async (filePath: string): Promise<MediaFile> => {
        if (!window.electronAPI) throw new Error('File upload requires Electron.');
        const info = await window.electronAPI.getFileInfo(filePath);
        if (info.size > MAX_MEDIA_BYTES) {
            throw new Error(`File too large. Maximum size is 3GB. Your file: ${formatFileSize(info.size)}`);
        }

        let fileDuration: number;
        let videoWidth: number | undefined;
        let videoHeight: number | undefined;
        if (isVideoFile(info.ext)) {
            const videoInfo = await window.electronAPI.getVideoInfo(info.path);
            fileDuration = videoInfo.duration;
            videoWidth = videoInfo.width ?? undefined;
            videoHeight = videoInfo.height ?? undefined;
        } else {
            fileDuration = await window.electronAPI.getDuration(info.path);
        }

        return {
            path: info.path,
            name: info.name,
            ext: info.ext,
            size: info.size,
            duration: fileDuration,
            isVideo: isVideoFile(info.ext),
            width: videoWidth,
            height: videoHeight,
        };
    }, []);

    const applyLoaded = useCallback(async (loaded: LoadedProject): Promise<OpenedProject> => {
        setCurrentProject(projectFromLoaded(loaded));
        setPendingMissing(
            loaded.missingMedia
                ? { dir: loaded.dir, name: loaded.missingMediaName || 'media file' }
                : null,
        );

        let file: MediaFile | null = null;
        if (loaded.mediaPath) {
            file = await inspectMedia(loaded.mediaPath);
            setMediaFile(file);
            setDuration(file.duration);
            setAudioPath(file.path);
        } else {
            setMediaFile(null);
            setAudioPath(null);
            setDuration(0);
        }

        const editor = editorStateFromLoaded(loaded);
        await refreshProjects();
        return {
            file,
            project: projectFromLoaded(loaded),
            missingMedia: loaded.missingMedia,
            missingMediaName: loaded.missingMediaName,
            ...editor,
        };
    }, [inspectMedia, refreshProjects]);

    const openLoaded = useCallback(async (loaded: LoadedProject | null): Promise<OpenedProject | null> => {
        if (!loaded) return null;
        return applyLoaded(loaded);
    }, [applyLoaded]);

    const handleOpenProject = useCallback(async (ref: string) => {
        if (!window.electronAPI) return null;
        setIsAnalyzing(true);
        setAnalyzingMessage('Opening project...');
        setProcessingError(null);
        try {
            const loaded = await window.electronAPI.openProject(ref);
            if (!loaded) throw new Error('Could not open that project.');
            return await openLoaded(loaded);
        } catch (err) {
            setProcessingError(err instanceof Error ? err.message : 'Failed to open project');
            return null;
        } finally {
            setIsAnalyzing(false);
        }
    }, [openLoaded]);

    const handleCreateEmpty = useCallback(async () => {
        if (!window.electronAPI) return null;
        setIsAnalyzing(true);
        setAnalyzingMessage('Creating project...');
        setProcessingError(null);
        try {
            const loaded = await window.electronAPI.createProject('Untitled Project');
            return await openLoaded(loaded);
        } catch (err) {
            setProcessingError(err instanceof Error ? err.message : 'Failed to create project');
            return null;
        } finally {
            setIsAnalyzing(false);
        }
    }, [openLoaded]);

    const collectInto = useCallback(async (projectDir: string, sourcePath: string) => {
        if (!window.electronAPI) throw new Error('File upload requires Electron.');
        const preview = await inspectMedia(sourcePath);
        setAnalyzingMessage('Copying media into project...');
        return window.electronAPI.collectProjectMedia({
            projectDir,
            sourcePath,
            duration: preview.duration,
            width: preview.width,
            height: preview.height,
            size: preview.size,
            isVideo: preview.isVideo,
        });
    }, [inspectMedia]);

    const handleAddOrReplaceMedia = useCallback(async (sourcePath: string, projectDir?: string) => {
        const dir = projectDir || currentProject?.dir;
        if (!dir || !window.electronAPI) return null;
        setIsAnalyzing(true);
        setAnalyzingMessage('Copying media into project...');
        setProcessingError(null);
        try {
            await window.electronAPI.registerPath?.(sourcePath);
            const loaded = await collectInto(dir, sourcePath);
            return await openLoaded(loaded);
        } catch (err) {
            setProcessingError(err instanceof Error ? err.message : 'Failed to add media');
            return null;
        } finally {
            setIsAnalyzing(false);
        }
    }, [collectInto, currentProject?.dir, openLoaded]);

    const processDroppedPath = useCallback(async (filePath: string): Promise<OpenedProject | null> => {
        if (!window.electronAPI) throw new Error('File upload requires Electron.');
        const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
        const base = filePath.split(/[/\\]/).pop() || filePath;

        if (ext === '.sublibr' || base === 'project.sublibr') {
            return handleOpenProject(filePath);
        }

        if (SUBTITLE_EXTS.has(ext)) {
            const created = await window.electronAPI.createProject(base.replace(/\.[^/.]+$/, '') || 'Untitled Project');
            const opened = await openLoaded(created);
            if (!opened) return null;
            return { ...opened, subtitleImportPath: filePath };
        }

        if (isSupportedFile(ext)) {
            setAnalyzingMessage('Copying media into project...');
            const preview = await inspectMedia(filePath);
            const loaded = currentProject
                ? await collectInto(currentProject.dir, filePath)
                : await window.electronAPI.createProjectFromMedia({
                    sourcePath: filePath,
                    name: preview.name,
                    duration: preview.duration,
                    width: preview.width,
                    height: preview.height,
                    size: preview.size,
                    isVideo: preview.isVideo,
                });
            return openLoaded(loaded);
        }

        const asProject = await window.electronAPI.openProject(filePath);
        if (asProject) return openLoaded(asProject);
        throw new Error('Drop a media file, a subtitle file, or a Sublibr project.');
    }, [collectInto, currentProject, handleOpenProject, inspectMedia, openLoaded]);

    const processFile = useCallback(async (filePath: string) => {
        setIsAnalyzing(true);
        setAnalyzingMessage('Opening...');
        setProcessingError(null);
        try {
            await window.electronAPI?.registerPath?.(filePath);
            return await processDroppedPath(filePath);
        } catch (err) {
            setProcessingError(err instanceof Error ? err.message : 'Failed to process file');
            return null;
        } finally {
            setIsAnalyzing(false);
        }
    }, [processDroppedPath]);

    const handleLoadRecent = useCallback(async (project: ProjectSummary) => {
        return handleOpenProject(project.dir);
    }, [handleOpenProject]);

    const handleLoadExisting = useCallback(async () => {
        if (!window.electronAPI?.openProjectDialog) return null;
        const picked = await window.electronAPI.openProjectDialog();
        if (!picked) return null;
        return handleOpenProject(picked);
    }, [handleOpenProject]);

    const handleRelink = useCallback(async () => {
        if (!window.electronAPI || !pendingMissing) return null;
        const filePath = await window.electronAPI.openFileDialog();
        if (!filePath) return null;
        return handleAddOrReplaceMedia(filePath, pendingMissing.dir);
    }, [handleAddOrReplaceMedia, pendingMissing]);

    const handleDuplicate = useCallback(async (project: ProjectSummary) => {
        if (!window.electronAPI?.duplicateProject) return;
        try {
            await window.electronAPI.duplicateProject(project.dir);
            await refreshProjects();
        } catch (err) {
            setProcessingError(err instanceof Error ? err.message : 'Failed to duplicate project');
        }
    }, [refreshProjects]);

    const [renameTarget, setRenameTarget] = useState<{ dir: string; name: string } | null>(null);

    const requestRename = useCallback((project: { dir: string; name: string }) => {
        setRenameTarget({ dir: project.dir, name: project.name });
    }, []);

    const cancelRename = useCallback(() => setRenameTarget(null), []);

    const submitRename = useCallback(async (name: string) => {
        if (!renameTarget || !window.electronAPI?.renameProject) return;
        const trimmed = name.trim();
        if (!trimmed) return;
        try {
            const loaded = await window.electronAPI.renameProject({
                projectDir: renameTarget.dir,
                name: trimmed,
                renameFolder: currentProject?.dir !== renameTarget.dir,
            });
            if (currentProject && (currentProject.dir === renameTarget.dir || currentProject.dir === loaded.dir)) {
                setCurrentProject({
                    dir: loaded.dir,
                    id: loaded.manifest.id,
                    name: loaded.manifest.name,
                });
            }
            setRenameTarget(null);
            await refreshProjects();
        } catch (err) {
            setProcessingError(err instanceof Error ? err.message : 'Failed to rename project');
        }
    }, [currentProject, refreshProjects, renameTarget]);

    const dismissMissing = useCallback(() => setPendingMissing(null), []);

    const requestDelete = useCallback((project: ProjectSummary) => {
        if (deleteCandidate) return;
        setDeleteCandidate(project);
        setDeleteStep(1);
    }, [deleteCandidate]);

    const cancelDelete = useCallback(() => {
        setDeleteCandidate(null);
        setDeleteStep(0);
    }, []);

    const confirmDelete = useCallback(async () => {
        if (!deleteCandidate || !window.electronAPI) return;
        if (deleteStep === 1) {
            setDeleteStep(2);
            return;
        }
        const dir = deleteCandidate.dir;
        try {
            await window.electronAPI.deleteProject(dir);
            if (currentProject?.dir === dir) {
                setCurrentProject(null);
                setMediaFile(null);
                setAudioPath(null);
                setDuration(0);
            }
            setDeleteCandidate(null);
            setDeleteStep(0);
            await refreshProjects();
        } catch (err) {
            setProcessingError(err instanceof Error ? err.message : 'Failed to delete project');
            setDeleteCandidate(null);
            setDeleteStep(0);
        }
    }, [currentProject?.dir, deleteCandidate, deleteStep, refreshProjects]);

    const handleNavigateRecentUp = useCallback(() => {
        if (currentProject || !latestProjects.length) return;
        setHighlightedRecentIndex(prev => {
            if (prev === null) return latestProjects.length - 1;
            return (prev - 1 + latestProjects.length) % latestProjects.length;
        });
    }, [currentProject, latestProjects.length]);

    const handleNavigateRecentDown = useCallback(() => {
        if (currentProject || !latestProjects.length) return;
        setHighlightedRecentIndex(prev => {
            if (prev === null) return 0;
            return (prev + 1) % latestProjects.length;
        });
    }, [currentProject, latestProjects.length]);

    const clearMedia = useCallback(() => {
        setCurrentProject(null);
        setMediaFile(null);
        setAudioPath(null);
        setDuration(0);
        setProcessingError(null);
        setIsAnalyzing(false);
        setHighlightedRecentIndex(null);
        setPendingMissing(null);
        refreshProjects();
    }, [refreshProjects]);

    return {
        currentProject,
        mediaFile,
        audioPath,
        duration,
        latestProjects,
        recentFiles: latestProjects,
        highlightedRecentIndex,
        processingError,
        isAnalyzing,
        analyzingMessage,
        pendingMissing,
        deleteCandidate,
        deleteStep,
        setDuration,
        setHighlightedRecentIndex,
        addToRecents: refreshProjects,
        handleClearRecents: refreshProjects,
        handleLoadRecent,
        processFile,
        handleFileSelect: processFile,
        handleCreateEmpty,
        handleLoadExisting,
        handleAddOrReplaceMedia,
        handleRelink,
        dismissMissing,
        requestDelete,
        handleDuplicate,
        renameTarget,
        requestRename,
        cancelRename,
        submitRename,
        cancelDelete,
        confirmDelete,
        handleNavigateRecentUp,
        handleNavigateRecentDown,
        clearMedia,
        refreshProjects,
    };
}
