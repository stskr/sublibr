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
    | 'translating'
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
export type AIProvider = 'gemini' | 'openai' | 'local';

export interface ProviderConfig {
    enabled: boolean;
    apiKey: string;
    model: string;
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
    positionY: number;       // 0–100 (% from top); used when positionYAuto is false
    /** When true (default), Y is computed from the render frame’s title-safe margin. */
    positionYAuto?: boolean;
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
    positionY: 95,
    positionYAuto: true,
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

/** `SubtitleStyle.fontSize` is designed for this frame width (16:9 1080p). */
export const FONT_REFERENCE_WIDTH = 1920;

/**
 * Width used to keep font the same relative size across frames.
 * Uses the 16:9 content width fitted into the frame so square/vertical
 * don't inflate type to the long side.
 */
export function fontReferenceWidth(frameW: number, frameH: number): number {
    if (frameW <= 0 || frameH <= 0) return FONT_REFERENCE_WIDTH;
    return Math.min(frameW, frameH * (16 / 9));
}

/** Scale a 1920-referenced font size onto a PlayRes or preview canvas. */
export function scaleFontToFrame(fontSize: number, frameW: number, frameH: number): number {
    return fontSize * (fontReferenceWidth(frameW, frameH) / FONT_REFERENCE_WIDTH);
}

export function frameAspectFromSize(
    screen: ScreenSize,
    mediaW?: number,
    mediaH?: number,
): 'wide' | 'square' | 'vertical' {
    if (screen === 'wide' || screen === 'square' || screen === 'vertical') return screen;
    if (mediaW && mediaH) {
        const r = mediaW / mediaH;
        if (r < 0.8) return 'vertical';
        if (r < 1.2) return 'square';
        return 'wide';
    }
    return 'wide';
}

/**
 * ASS Fontsize for this output frame.
 * Global Style 56 means “1080p 16:9 size”; other frames get a matching share of their width
 * (a bit larger on 1:1 / 9:16 so type still reads in a narrow column).
 */
export function fontSizeForPlayRes(
    baseFontSize: number,
    screen: ScreenSize,
    mediaW?: number,
    mediaH?: number,
): number {
    const [playResX] = getPlayRes(screen, mediaW, mediaH);
    const aspect = frameAspectFromSize(screen, mediaW, mediaH);
    const userScale = (baseFontSize || 56) / 56;
    const fraction =
        aspect === 'vertical' ? 56 / 1080 :
        aspect === 'square' ? 48 / 1080 :
        56 / 1920;
    return Math.max(12, Math.round(userScale * fraction * playResX));
}

/** CSS pixels so Preview matches burn-in on the current canvas. */
export function previewFontSize(
    baseFontSize: number,
    screen: ScreenSize,
    canvasW: number,
    mediaW?: number,
    mediaH?: number,
): number {
    const [playResX] = getPlayRes(screen, mediaW, mediaH);
    if (playResX <= 0 || canvasW <= 0) return 16;
    const ass = fontSizeForPlayRes(baseFontSize, screen, mediaW, mediaH);
    return Math.max(10, ass * (canvasW / playResX));
}

/**
 * Default Y for a bottom-center subtitle (\an2 / translate(-50%, -100%)).
 *
 * Title-safe gap under the cue is 5% of the shorter side (EBU/Netflix-style).
 * Because the anchor is the BOTTOM of the text:
 *
 *   Y% = 100 × (1 − gapPx / PlayResY)
 *
 * 16:9 and 1:1 → ~95%. 9:16 → ~97% (same pixel gap on a taller frame).
 */
export function defaultSubtitlePositionY(
    screen: ScreenSize,
    mediaW?: number,
    mediaH?: number,
): number {
    const [playResX, playResY] = getPlayRes(screen, mediaW, mediaH);
    if (playResY <= 0) return 95;
    const gapPx = 0.05 * Math.min(playResX, playResY);
    return Math.round(100 * (1 - gapPx / playResY));
}

export function effectiveSubtitlePositionY(
    style: Pick<SubtitleStyle, 'positionY' | 'positionYAuto'>,
    screen: ScreenSize,
    mediaW?: number,
    mediaH?: number,
): number {
    if (style.positionYAuto === false) return style.positionY;
    return defaultSubtitlePositionY(screen, mediaW, mediaH);
}

// Reset still uses the 1920-referenced default; actual output is scaled in preview/ASS.
export const SCREEN_SIZE_FONT_DEFAULTS: Record<ScreenSize, number> = {
    wide:     56,
    square:   56,
    vertical: 56,
    original: 56,
};

export interface ImportedLocalModel {
    id: string;
    label: string;
    path: string;
    runtime: 'whisper' | 'llama';
    architecture: string;
}

export interface TranslatorConfig {
    provider: AIProvider;
    model: string;
}

// Settings
export interface AppSettings {
    activeProvider: AIProvider;
    translator: TranslatorConfig;
    providers: Record<AIProvider, ProviderConfig>;
    language: string;
    autoDetectLanguage: boolean;
    screenSize: ScreenSize;
    subtitleStyle: SubtitleStyle;
    /** 0 = keep the local translator loaded until quit. */
    unloadAfterMinutes: number;
    /** Folder where transcripts, extracted media, and working files live. */
    projectsFolder: string;
    /** True after the user has confirmed a projects folder on first run or in Settings. */
    projectsFolderSet: boolean;
    /** User-added whisper.cpp / llama.cpp files that passed inspection. */
    importedLocalModels: ImportedLocalModel[];
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
    estimated?: boolean;
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

export interface ProjectSummary {
    dir: string;
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    mediaName: string | null;
    subtitleCount: number;
    hasMedia: boolean;
    missingMedia: boolean;
}

export interface LoadedProject {
    dir: string;
    manifest: {
        id: string;
        name: string;
        createdAt: number;
        updatedAt: number;
        media: {
            relativePath: string | null;
            originalName: string | null;
            duration?: number;
            width?: number | null;
            height?: number | null;
            size?: number;
            isVideo?: boolean;
        } | null;
    };
    subtitles: unknown;
    versions: unknown;
    mediaPath: string | null;
    missingMedia: boolean;
    missingMediaName: string | null;
}
