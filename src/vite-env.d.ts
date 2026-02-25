/// <reference types="vite/client" />

// Electron API types exposed via preload
export interface ElectronAPI {
    getStoreValue: (key: string) => Promise<unknown>;
    setStoreValue: (key: string, value: unknown) => Promise<void>;
    deleteStoreValue: (key: string) => Promise<void>;
    openFileDialog: () => Promise<string | null>;
    openSubtitleFileDialog: () => Promise<string | null>;
    saveFileDialog: (defaultName: string, filterName?: string, filterExtensions?: string[]) => Promise<string | null>;
    showMessageBox: (options: Electron.MessageBoxOptions) => Promise<Electron.MessageBoxReturnValue>;
    getFilePath?: (file: File) => string;

    readFile: (path: string) => Promise<ArrayBuffer>;

    writeFile: (path: string, data: string) => Promise<void>;
    getFileInfo: (path: string) => Promise<{ size: number; path: string; name: string; ext: string }>;
    getTempPath: () => Promise<string>;
    registerPath: (path: string) => Promise<void>;
    cleanupTempAudio: () => Promise<void>;

    // AI API proxy
    testApiKey: (provider: string, apiKey: string) => Promise<{ ok: boolean; error?: string }>;
    callProvider: (provider: string, apiKey: string, model: string, prompt: string, audioBase64: string, audioFormat?: string, language?: string | null, previousTranscript?: string) => Promise<{
        text: string;
        tokenUsage: {
            inputTokens: number;
            outputTokens: number;
            provider: 'gemini' | 'openai';
            model: string;
            timestamp: number;
        };
    }>;
    callTextProvider: (provider: string, apiKey: string, model: string, prompt: string) => Promise<{
        text: string;
        tokenUsage: {
            inputTokens: number;
            outputTokens: number;
            provider: 'gemini' | 'openai';
            model: string;
            timestamp: number;
        };
    }>;
    extractAudio: (inputPath: string, outputPath: string, format?: string) => Promise<string>;
    getDuration: (filePath: string) => Promise<number>;
    detectSilences: (filePath: string, threshold: number, minDuration: number) => Promise<{ start: number; end: number }[]>;
    splitAudio: (inputPath: string, chunks: { start: number; end: number; outputPath: string }[], format?: string) => Promise<string[]>;
    getVideoInfo: (filePath: string) => Promise<{ duration: number; width: number | null; height: number | null }>;
    burnSubtitles: (inputPath: string, subtitleContent: string, outputPath: string, targetWidth: number | null, targetHeight: number | null, subtitleFormat?: 'srt' | 'ass') => Promise<string>;
    onBurnSubtitlesProgress: (callback: (progress: { percent: number }) => void) => () => void;
    onExtractAudioProgress: (callback: (progress: { percent: number }) => void) => () => void;
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
