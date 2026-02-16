/// <reference types="vite/client" />

// Electron API types exposed via preload
export interface ElectronAPI {
    getStoreValue: (key: string) => Promise<unknown>;
    setStoreValue: (key: string, value: unknown) => Promise<void>;
    openFileDialog: () => Promise<string | null>;
    openSubtitleFileDialog: () => Promise<string | null>;
    saveFileDialog: (defaultName: string) => Promise<string | null>;
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
    onProgress: (callback: (progress: number) => void) => void;
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}
