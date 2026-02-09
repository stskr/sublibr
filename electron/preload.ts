import { contextBridge, ipcRenderer } from 'electron';

// Expose safe APIs to renderer
contextBridge.exposeInMainWorld('electronAPI', {
    // Settings
    getStoreValue: (key: string) => ipcRenderer.invoke('store:get', key),
    setStoreValue: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),

    // File dialogs
    openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
    saveFileDialog: (defaultName: string) => ipcRenderer.invoke('dialog:saveFile', defaultName),

    // File operations
    readFile: (path: string) => ipcRenderer.invoke('file:read', path),
    writeFile: (path: string, data: string) => ipcRenderer.invoke('file:write', path, data),
    getFileInfo: (path: string) => ipcRenderer.invoke('file:getInfo', path),
    getTempPath: () => ipcRenderer.invoke('file:getTempPath'),

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

// Type declarations for renderer
export interface ElectronAPI {
    getStoreValue: (key: string) => Promise<unknown>;
    setStoreValue: (key: string, value: unknown) => Promise<void>;
    openFileDialog: () => Promise<string | null>;
    saveFileDialog: (defaultName: string) => Promise<string | null>;
    readFile: (path: string) => Promise<Buffer>;
    writeFile: (path: string, data: string) => Promise<void>;
    getFileInfo: (path: string) => Promise<{ size: number; path: string; name: string; ext: string }>;
    getTempPath: () => Promise<string>;
    extractAudio: (inputPath: string, outputPath: string) => Promise<string>;
    getDuration: (filePath: string) => Promise<number>;
    detectSilences: (filePath: string, threshold: number, minDuration: number) => Promise<{ start: number; end: number }[]>;
    splitAudio: (inputPath: string, chunks: { start: number; end: number; outputPath: string }[]) => Promise<string[]>;
    onProgress: (callback: (progress: number) => void) => void;
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}
