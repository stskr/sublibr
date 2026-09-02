/// <reference types="vite/client" />

// Electron API types exposed via preload
export interface ElectronAPI {
    getStoreValue: (key: string) => Promise<unknown>;
    setStoreValue: (key: string, value: unknown) => Promise<void>;
    deleteStoreValue: (key: string) => Promise<void>;
    openFileDialog: () => Promise<string | null>;
    openImportDialog: () => Promise<string | null>;
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
    getProjectsFolder: () => Promise<string>;
    getDefaultProjectsFolder: () => Promise<string>;
    pickProjectsFolder: () => Promise<string | null>;
    confirmProjectsFolder: (folder: string) => Promise<string>;
    chooseProjectsFolder: () => Promise<string | null>;
    loadProject: (sourcePath: string) => Promise<{ dir: string; subtitles: unknown; versions: unknown } | null>;
    saveProject: (payload: { projectDir?: string; sourcePath?: string; name?: string; subtitles?: unknown; versions?: unknown }) => Promise<string>;
    listProjects: () => Promise<import('./types').ProjectSummary[]>;
    createProject: (name?: string) => Promise<import('./types').LoadedProject>;
    openProject: (ref: string) => Promise<import('./types').LoadedProject | null>;
    createProjectFromMedia: (payload: { sourcePath: string; name?: string; duration?: number; width?: number; height?: number; size?: number; isVideo?: boolean }) => Promise<import('./types').LoadedProject>;
    collectProjectMedia: (payload: { projectDir: string; sourcePath: string; duration?: number; width?: number; height?: number; size?: number; isVideo?: boolean }) => Promise<import('./types').LoadedProject>;
    deleteProject: (projectDir: string) => Promise<void>;
    duplicateProject: (projectDir: string) => Promise<import('./types').LoadedProject>;
    renameProject: (payload: { projectDir: string; name: string; renameFolder?: boolean }) => Promise<import('./types').LoadedProject>;
    openProjectDialog: () => Promise<string | null>;
    openModelFileDialog: (runtime: 'whisper' | 'llama') => Promise<
        | { cancelled: true }
        | { ok: true; model: import('./types').ImportedLocalModel }
        | { ok: false; error: string }
    >;
    bindSession: (payload: { projectDir?: string; sourcePath?: string; name: string; media?: unknown; settings?: unknown }) => Promise<{ sessionId: string; file: string; dir: string }>;
    logSession: (payload: { event: string; data?: unknown; level?: 'info' | 'warn' | 'error' }) => Promise<void>;

    // AI API proxy
    testApiKey: (provider: string, apiKey: string) => Promise<{ ok: boolean; error?: string; llm?: boolean; llmError?: string }>;
    callProvider: (provider: string, apiKey: string, model: string, prompt: string, audioBase64: string, audioFormat?: string, language?: string | null, previousTranscript?: string) => Promise<{
        text: string;
        tokenUsage: {
            inputTokens: number;
            outputTokens: number;
            provider: 'gemini' | 'openai' | 'local';
            model: string;
            timestamp: number;
            estimated?: boolean;
        };
    }>;
    callTextProvider: (provider: string, apiKey: string, model: string, prompt: string) => Promise<{
        text: string;
        tokenUsage: {
            inputTokens: number;
            outputTokens: number;
            provider: 'gemini' | 'openai' | 'local';
            model: string;
            timestamp: number;
            estimated?: boolean;
        };
    }>;
    stopLocalLlm: () => Promise<void>;
    callLocalTranscribe: (filePath: string, language?: string | null, model?: string) => Promise<{
        text: string;
        tokenUsage: {
            inputTokens: number;
            outputTokens: number;
            provider: 'gemini' | 'openai' | 'local';
            model: string;
            timestamp: number;
            estimated?: boolean;
        };
    }>;
    getLocalModelStatus: () => Promise<{
        dir: string;
        whisperCli: boolean;
        llamaServer: boolean;
        files: Array<{
            id: string;
            file: string;
            present: boolean;
            bytesOnDisk: number;
            bytesExpected: number;
            dest: string;
        }>;
    }>;
    downloadLocalModel: (id: string) => Promise<{
        id: string;
        file: string;
        present: boolean;
        bytesOnDisk: number;
        bytesExpected: number;
        dest: string;
    }>;
    cancelLocalModelDownload: (id: string) => Promise<boolean>;
    getOfflineSetupStatus: () => Promise<{
        brew: { present: boolean; path: string | null };
        items: Array<{
            id: string;
            label: string;
            why: string;
            present: boolean;
            install: 'none' | 'brew' | 'download';
            formula?: string;
            detail: string;
            bytes?: number;
            neededFor: 'transcribe' | 'translate';
        }>;
    }>;
    installOfflineDeps: (ids: string[]) => Promise<unknown>;
    cancelOfflineSetup: () => Promise<boolean>;
    onOfflineSetupProgress: (callback: (progress: {
        id: string;
        status: 'waiting' | 'installing' | 'downloading' | 'ready' | 'error' | 'cancelled';
        percent?: number;
        detail?: string;
        error?: string;
    }) => void) => () => void;
    onLocalModelDownloadProgress: (callback: (progress: {
        id: string;
        received: number;
        total: number;
        percent: number;
        status: 'downloading' | 'done' | 'error' | 'cancelled';
        error?: string;
    }) => void) => () => void;
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
