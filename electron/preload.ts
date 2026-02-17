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
        const listener = (_event: Electron.IpcRendererEvent, progress: number) => callback(progress);
        ipcRenderer.on('progress', listener);
        return () => { ipcRenderer.removeListener('progress', listener); };
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
