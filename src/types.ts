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
    | 'paused'
    | 'merging'
    | 'healing'
    | 'rendering'
    | 'done'
    | 'error';

export interface ProcessingState {
    status: ProcessingStatus;
    progress: number; // 0-100
    currentChunk?: number;
    totalChunks?: number;
    error?: string;
    warning?: string; // Non-fatal issue (e.g. healing step failed)
}

// AI Providers
export type AIProvider = 'gemini' | 'openai';

export interface ProviderConfig {
    enabled: boolean;
    apiKey: string;
    model: string;
    freeTier?: boolean;
}

// Screen constraint options for generating subtitles
export type ScreenSize = 'wide' | 'square' | 'vertical' | 'original';

// Global subtitle style applied to all subtitles in the preview and exported files.
// Per-word markup (<font color="...">) acts as an override via CSS cascade.
export interface SubtitleStyle {
    fontFamily: string;
    fontSize: number;        // ASS PlayRes units (default 56 at PlayResX=1920)
    textColor: string;       // hex e.g. '#FFFFFF'
    outlineMode: 'none' | 'outline' | 'shadow' | 'both';
    outlineColor: string;
    outlineWidth: number;    // 0.5 – 5.0 px
    shadowColor: string;
    shadowOffsetX: number;   // px
    shadowOffsetY: number;   // px
    shadowBlur: number;      // px
    backgroundEnabled: boolean;
    backgroundColor: string;
    backgroundOpacity: number; // 0 – 1
    positionX: number;       // 0–100 (% from left), 50 = centered
    positionY: number;       // 0–100 (% from top), 85 = near-bottom standard
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
    fontFamily: 'Arial',
    fontSize: 56,
    textColor: '#FFFFFF',
    outlineMode: 'both',
    outlineColor: '#000000',
    outlineWidth: 1.0,
    shadowColor: '#000000',
    shadowOffsetX: 1,
    shadowOffsetY: 1,
    shadowBlur: 0,
    backgroundEnabled: false,
    backgroundColor: '#000000',
    backgroundOpacity: 0.8,
    positionX: 50,
    positionY: 85,
};

// PlayRes dimensions used for ASS generation and preview font scaling.
// `mediaWidth/Height` are only used for the 'original' mode.
export function getPlayRes(screenSize: ScreenSize, mediaWidth?: number, mediaHeight?: number): [number, number] {
    switch (screenSize) {
        case 'wide':     return [1920, 1080];
        case 'square':   return [1080, 1080];
        case 'vertical': return [1080, 1920];
        case 'original':
        default:
            return mediaWidth && mediaHeight ? [mediaWidth, mediaHeight] : [1920, 1080];
    }
}

// Sensible per-format font size defaults (ASS PlayRes units).
export const SCREEN_SIZE_FONT_DEFAULTS: Record<ScreenSize, number> = {
    wide:     56,
    square:   40,
    vertical: 36,
    original: 56,
};

// Settings
export interface AppSettings {
    activeProvider: AIProvider;
    providers: Record<AIProvider, ProviderConfig>;
    language: string;
    autoDetectLanguage: boolean;
    screenSize: ScreenSize;
    subtitleStyle: SubtitleStyle;
}

// File info
export interface MediaFile {
    path: string;
    name: string;
    ext: string;
    size: number;
    duration: number;
    isVideo: boolean;
    width?: number;
    height?: number;
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
