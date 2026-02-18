// Subtitle entry
export interface Subtitle {
    id: string;
    index: number;
    startTime: number; // seconds
    endTime: number; // seconds
    text: string;
}

export interface SubtitleVersion {
    id: string; // uuid
    timestamp: number;
    provider: string;
    model: string;
    language: string;
    subtitles: Subtitle[];
    label?: string; // Optional user label
}

// Audio chunk for processing
export interface AudioChunk {
    index: number;
    startTime: number;
    endTime: number;
    filePath: string;
    overlap: number; // overlap with previous chunk in seconds
}

// Processing state
export type ProcessingStatus =
    | 'idle'
    | 'extracting'
    | 'detecting-silences'
    | 'splitting'
    | 'transcribing'
    | 'merging'
    | 'healing'
    | 'done'
    | 'error';

export interface ProcessingState {
    status: ProcessingStatus;
    progress: number; // 0-100
    currentChunk?: number;
    totalChunks?: number;
    error?: string;
}

// AI Providers
export type AIProvider = 'gemini' | 'anthropic' | 'openai';

export interface ProviderConfig {
    enabled: boolean;
    apiKey: string;
    model: string;
}

// Settings
export interface AppSettings {
    activeProvider: AIProvider;
    providers: Record<AIProvider, ProviderConfig>;
    language: string;
    autoDetectLanguage: boolean;
}

// File info
export interface MediaFile {
    path: string;
    name: string;
    ext: string;
    size: number;
    duration: number;
    isVideo: boolean;
}

export interface SilenceSegment {
    start: number;
    end: number;
}

// Token usage tracking
export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    provider: AIProvider;
    model: string;
    timestamp: number;
}

export interface SessionTokenStats {
    totalInputTokens: number;
    totalOutputTokens: number;
    calls: TokenUsage[];
}

export interface RecentFile {
    path: string;
    name: string;
    date: number; // timestamp
    lastAction: 'generated' | 'opened';
    subtitleCount?: number;
}
