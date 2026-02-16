import { contextBridge, ipcRenderer, webUtils } from 'electron';

// Expose safe APIs to renderer
contextBridge.exposeInMainWorld('electronAPI', {
    // Utils
    getFilePath: (file: File) => webUtils.getPathForFile(file),

    // Settings
    getStoreValue: (key: string) => ipcRenderer.invoke('store:get', key),
    setStoreValue: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),

    // File dialogs
    openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
    openSubtitleFileDialog: () => ipcRenderer.invoke('dialog:openSubtitleFile'),
    saveFileDialog: (defaultName: string) => ipcRenderer.invoke('dialog:saveFile', defaultName),
    showMessageBox: (options: Electron.MessageBoxOptions) => ipcRenderer.invoke('dialog:showMessageBox', options),

    // File operations
    readFile: (path: string) => ipcRenderer.invoke('file:read', path),
    readFileAsDataUrl: (path: string) => ipcRenderer.invoke('file:readAsDataUrl', path),
    writeFile: (path: string, data: string) => ipcRenderer.invoke('file:write', path, data),
    getFileInfo: (path: string) => ipcRenderer.invoke('file:getInfo', path),
    getTempPath: () => ipcRenderer.invoke('file:getTempPath'),
    registerPath: (path: string) => ipcRenderer.invoke('file:registerPath', path),

    // FFmpeg operations
    extractAudio: (inputPath: string, outputPath: string) =>
        ipcRenderer.invoke('ffmpeg:extractAudio', inputPath, outputPath),
    getDuration: (filePath: string) =>
        ipcRenderer.invoke('ffmpeg:getDuration', filePath),
    detectSilences: (filePath: string, threshold: number, minDuration: number) =>
        ipcRenderer.invoke('ffmpeg:detectSilences', filePath, threshold, minDuration),
    splitAudio: (inputPath: string, chunks: { start: number; end: number; outputPath: string }[]) =>
        ipcRenderer.invoke('ffmpeg:splitAudio', inputPath, chunks),

    // Progress events
    onProgress: (callback: (progress: number) => void) => {
        ipcRenderer.on('progress', (_event, progress) => callback(progress));
    },

    // App updates
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),
    downloadUpdate: () => ipcRenderer.invoke('app:downloadUpdate'),
    installUpdate: () => ipcRenderer.invoke('app:installUpdate'),
    onUpdateAvailable: (callback: (info: { version: string; releaseNotes?: string; releaseDate?: string }) => void) => {
        ipcRenderer.on('update-available', (_event, info) => callback(info));
    },
    onUpdateProgress: (callback: (progress: { percent: number; transferred: number; total: number }) => void) => {
        ipcRenderer.on('update-download-progress', (_event, progress) => callback(progress));
    },
    onUpdateDownloaded: (callback: (info: { version: string }) => void) => {
        ipcRenderer.on('update-downloaded', (_event, info) => callback(info));
    },
    onUpdateError: (callback: (message: string) => void) => {
        ipcRenderer.on('update-error', (_event, message) => callback(message));
    },
});
