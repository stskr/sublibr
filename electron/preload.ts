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
});
