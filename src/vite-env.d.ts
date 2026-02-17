/// <reference types="vite/client" />

// Electron API types exposed via preload
export interface ElectronAPI {
    getStoreValue: (key: string) => Promise<unknown>;
    setStoreValue: (key: string, value: unknown) => Promise<void>;
    openFileDialog: () => Promise<string | null>;
    openSubtitleFileDialog: () => Promise<string | null>;
    saveFileDialog: (defaultName: string, filterName?: string, filterExtensions?: string[]) => Promise<string | null>;
    showMessageBox: (options: any) => Promise<Electron.MessageBoxReturnValue>;
    getFilePath?: (file: File) => string;

    readFile: (path: string) => Promise<ArrayBuffer>;
    readFileAsDataUrl: (path: string) => Promise<string>;
    writeFile: (path: string, data: string) => Promise<void>;
    getFileInfo: (path: string) => Promise<{ size: number; path: string; name: string; ext: string }>;
    getTempPath: () => Promise<string>;
    registerPath: (path: string) => Promise<void>;
    extractAudio: (inputPath: string, outputPath: string) => Promise<string>;
    getDuration: (filePath: string) => Promise<number>;
    detectSilences: (filePath: string, threshold: number, minDuration: number) => Promise<{ start: number; end: number }[]>;
    splitAudio: (inputPath: string, chunks: { start: number; end: number; outputPath: string }[]) => Promise<string[]>;
    onProgress: (callback: (progress: number) => void) => () => void;

    // App updates
    getVersion: () => Promise<string>;
    checkForUpdates: () => Promise<{ updateAvailable: boolean }>;
    downloadUpdate: () => Promise<void>;
    installUpdate: () => void;
    onUpdateAvailable: (callback: (info: { version: string; releaseNotes?: string; releaseDate?: string }) => void) => () => void;
    onUpdateProgress: (callback: (progress: { percent: number; transferred: number; total: number }) => void) => () => void;
    onUpdateDownloaded: (callback: (info: { version: string }) => void) => () => void;
    onUpdateError: (callback: (message: string) => void) => () => void;
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}
