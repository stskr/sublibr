import { contextBridge, ipcRenderer, webUtils } from 'electron';

// Expose safe APIs to renderer
contextBridge.exposeInMainWorld('electronAPI', {
    // Utils
    getFilePath: (file: File) => webUtils.getPathForFile(file),

    // Settings
    getStoreValue: (key: string) => ipcRenderer.invoke('store:get', key),
    setStoreValue: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),
    deleteStoreValue: (key: string) => ipcRenderer.invoke('store:delete', key),

    // File dialogs
    openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
    openSubtitleFileDialog: () => ipcRenderer.invoke('dialog:openSubtitleFile'),
    saveFileDialog: (defaultName: string, filterName?: string, filterExtensions?: string[]) => ipcRenderer.invoke('dialog:saveFile', defaultName, filterName, filterExtensions),
    showMessageBox: (options: Electron.MessageBoxOptions) => ipcRenderer.invoke('dialog:showMessageBox', options),

    // File operations
    readFile: (path: string) => ipcRenderer.invoke('file:read', path),

    writeFile: (path: string, data: string) => ipcRenderer.invoke('file:write', path, data),
    getFileInfo: (path: string) => ipcRenderer.invoke('file:getInfo', path),
    getTempPath: () => ipcRenderer.invoke('file:getTempPath'),
    registerPath: (path: string) => ipcRenderer.invoke('file:registerPath', path),
    cleanupTempAudio: () => ipcRenderer.invoke('file:cleanupTempAudio'),
    getProjectsFolder: () => ipcRenderer.invoke('projects:getFolder'),
    getDefaultProjectsFolder: () => ipcRenderer.invoke('projects:getDefaultFolder'),
    pickProjectsFolder: () => ipcRenderer.invoke('projects:pickFolder'),
    confirmProjectsFolder: (folder: string) => ipcRenderer.invoke('projects:confirmFolder', folder),
    chooseProjectsFolder: () => ipcRenderer.invoke('projects:chooseFolder'),
    loadProject: (sourcePath: string) => ipcRenderer.invoke('projects:load', sourcePath),
    saveProject: (payload: { projectDir?: string; sourcePath?: string; name?: string; subtitles?: unknown; versions?: unknown }) =>
        ipcRenderer.invoke('projects:save', payload),
    listProjects: () => ipcRenderer.invoke('projects:list'),
    createProject: (name?: string) => ipcRenderer.invoke('projects:create', name),
    openProject: (ref: string) => ipcRenderer.invoke('projects:open', ref),
    createProjectFromMedia: (payload: { sourcePath: string; name?: string; duration?: number; width?: number; height?: number; size?: number; isVideo?: boolean }) =>
        ipcRenderer.invoke('projects:createFromMedia', payload),
    collectProjectMedia: (payload: { projectDir: string; sourcePath: string; duration?: number; width?: number; height?: number; size?: number; isVideo?: boolean }) =>
        ipcRenderer.invoke('projects:collectMedia', payload),
    deleteProject: (projectDir: string) => ipcRenderer.invoke('projects:delete', projectDir),
    duplicateProject: (projectDir: string) => ipcRenderer.invoke('projects:duplicate', projectDir),
    renameProject: (payload: { projectDir: string; name: string; renameFolder?: boolean }) =>
        ipcRenderer.invoke('projects:rename', payload),
    openProjectDialog: () => ipcRenderer.invoke('dialog:openProject'),
    bindSession: (payload: { projectDir?: string; sourcePath?: string; name: string; media?: unknown; settings?: unknown }) =>
        ipcRenderer.invoke('session:bind', payload),
    logSession: (payload: { event: string; data?: unknown; level?: 'info' | 'warn' | 'error' }) =>
        ipcRenderer.invoke('session:log', payload),

    // AI API proxy (calls go through main process — keys never exposed in renderer)
    testApiKey: (provider: string, apiKey: string) => ipcRenderer.invoke('ai:testApiKey', provider, apiKey),
    callProvider: (provider: string, apiKey: string, model: string, prompt: string, audioBase64: string, audioFormat?: string, language?: string | null, previousTranscript?: string) =>
        ipcRenderer.invoke('ai:callProvider', provider, apiKey, model, prompt, audioBase64, audioFormat, language, previousTranscript),
    callTextProvider: (provider: string, apiKey: string, model: string, prompt: string) =>
        ipcRenderer.invoke('ai:callTextProvider', provider, apiKey, model, prompt),
    stopLocalLlm: () => ipcRenderer.invoke('ai:stopLocalLlm'),
    callLocalTranscribe: (filePath: string, language?: string | null, model?: string) =>
        ipcRenderer.invoke('ai:callLocalTranscribe', filePath, language, model),

    // FFmpeg operations
    extractAudio: (inputPath: string, outputPath: string, format?: string) => ipcRenderer.invoke('ffmpeg:extractAudio', inputPath, outputPath, format),
    getDuration: (filePath: string) => ipcRenderer.invoke('ffmpeg:getDuration', filePath),
    detectSilences: (filePath: string, threshold: number, minDuration: number) => ipcRenderer.invoke('ffmpeg:detectSilences', filePath, threshold, minDuration),
    splitAudio: (inputPath: string, chunks: { start: number; end: number; outputPath: string }[], format?: string) => ipcRenderer.invoke('ffmpeg:splitAudio', inputPath, chunks, format),
    getVideoInfo: (filePath: string) => ipcRenderer.invoke('ffmpeg:getVideoInfo', filePath),
    burnSubtitles: (inputPath: string, subtitleContent: string, outputPath: string, targetWidth: number | null, targetHeight: number | null, subtitleFormat?: 'srt' | 'ass') => ipcRenderer.invoke('ffmpeg:burnSubtitles', inputPath, subtitleContent, outputPath, targetWidth, targetHeight, subtitleFormat ?? 'ass'),
    onBurnSubtitlesProgress: (callback: (progress: { percent: number }) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, progress: { percent: number }) => callback(progress);
        ipcRenderer.on('ffmpeg:burnSubtitlesProgress', listener);
        return () => { ipcRenderer.removeListener('ffmpeg:burnSubtitlesProgress', listener); };
    },
    onExtractAudioProgress: (callback: (progress: { percent: number }) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, progress: { percent: number }) => callback(progress);
        ipcRenderer.on('ffmpeg:extractAudioProgress', listener);
        return () => { ipcRenderer.removeListener('ffmpeg:extractAudioProgress', listener); };
    },

    // App updates
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),
    downloadUpdate: () => ipcRenderer.invoke('app:downloadUpdate'),
    installUpdate: () => ipcRenderer.invoke('app:installUpdate'),
    onUpdateAvailable: (callback: (info: { version: string; releaseNotes?: string; releaseDate?: string }) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, info: { version: string; releaseNotes?: string; releaseDate?: string }) => callback(info);
        ipcRenderer.on('update-available', listener);
        return () => { ipcRenderer.removeListener('update-available', listener); };
    },
    onUpdateProgress: (callback: (progress: { percent: number; transferred: number; total: number }) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, progress: { percent: number; transferred: number; total: number }) => callback(progress);
        ipcRenderer.on('update-download-progress', listener);
        return () => { ipcRenderer.removeListener('update-download-progress', listener); };
    },
    onUpdateDownloaded: (callback: (info: { version: string }) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, info: { version: string }) => callback(info);
        ipcRenderer.on('update-downloaded', listener);
        return () => { ipcRenderer.removeListener('update-downloaded', listener); };
    },
    onUpdateError: (callback: (message: string) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, message: string) => callback(message);
        ipcRenderer.on('update-error', listener);
        return () => { ipcRenderer.removeListener('update-error', listener); };
    },
});
