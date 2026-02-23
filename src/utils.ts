// Format seconds to SRT timecode: HH:MM:SS,mmm
export function formatSrtTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

// Format seconds to WebVTT timecode: HH:MM:SS.mmm
export function formatVttTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

// Format seconds to ASS timecode: H:MM:SS.cc (centiseconds)
export function formatAssTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const cs = Math.floor(((seconds % 1) * 100)); // centiseconds

    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}

// Parse SRT timecode to seconds
export function parseSrtTime(timecode: string): number {
    const match = timecode.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
    if (!match) return 0;

    const [, hours, minutes, seconds, ms] = match;
    return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds) + parseInt(ms) / 1000;
}

// Format seconds to display time: MM:SS
export function formatDisplayTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Generate unique ID
export function generateId(): string {
    return Math.random().toString(36).substring(2, 11);
}

// Format file size
export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// Video extensions
const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.ts', '.mts', '.m2ts'];
// Audio extensions
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.aac', '.wma', '.alac', '.aiff'];

export function isVideoFile(ext: string): boolean {
    return VIDEO_EXTENSIONS.includes(ext.toLowerCase());
}

function isAudioFile(ext: string): boolean {
    return AUDIO_EXTENSIONS.includes(ext.toLowerCase());
}

export function isSupportedFile(ext: string): boolean {
    return isVideoFile(ext) || isAudioFile(ext);
}

// Estimate API cost based on audio duration
// Uses canonical pricing from providers.ts via dynamic import to avoid duplication
export function estimateCost(durationSeconds: number, model: string): { chunks: number; estimatedTokens: number; estimatedCostUSD: number } {
    // Estimate ~80 tokens per second of audio transcription output
    // Plus ~100 tokens for prompt per chunk
    const chunkDuration = 75; // average chunk size in seconds
    const chunks = Math.ceil(durationSeconds / chunkDuration);
    const tokensPerChunk = 80 * chunkDuration + 100; // output + prompt
    const estimatedTokens = chunks * tokensPerChunk;

    // Inline fallback pricing (output rate per 1M tokens) — kept minimal;
    // canonical source of truth is MODEL_PRICING in providers.ts
    const outputRates: Record<string, number> = {
        'gemini-2.5-flash': 0.60, 'gemini-2.5-pro': 10.00,
        'gpt-4o-mini': 0.60, 'gpt-4o': 10.00,
    };
    const ratePerMillion = outputRates[model] ?? 0.60;
    const estimatedCostUSD = (estimatedTokens / 1_000_000) * ratePerMillion;

    return { chunks, estimatedTokens, estimatedCostUSD };
}

// Languages list for autocomplete
export const LANGUAGES = [
    'Afrikaans', 'Albanian', 'Amharic', 'Arabic', 'Armenian', 'Azerbaijani',
    'Basque', 'Belarusian', 'Bengali', 'Bosnian', 'Bulgarian', 'Burmese',
    'Catalan', 'Cebuano', 'Chinese (Simplified)', 'Chinese (Traditional)', 'Corsican', 'Croatian', 'Czech',
    'Danish', 'Dutch',
    'English', 'Esperanto', 'Estonian',
    'Filipino', 'Finnish', 'French',
    'Galician', 'Georgian', 'German', 'Greek', 'Gujarati',
    'Haitian Creole', 'Hausa', 'Hawaiian', 'Hebrew', 'Hindi', 'Hmong', 'Hungarian',
    'Icelandic', 'Igbo', 'Indonesian', 'Irish', 'Italian',
    'Japanese', 'Javanese',
    'Kannada', 'Kazakh', 'Khmer', 'Kinyarwanda', 'Korean', 'Kurdish', 'Kyrgyz',
    'Lao', 'Latin', 'Latvian', 'Lithuanian', 'Luxembourgish',
    'Macedonian', 'Malagasy', 'Malay', 'Malayalam', 'Maltese', 'Maori', 'Marathi', 'Mongolian',
    'Nepali', 'Norwegian',
    'Odia',
    'Pashto', 'Persian', 'Polish', 'Portuguese', 'Punjabi',
    'Romanian', 'Russian',
    'Samoan', 'Scottish Gaelic', 'Serbian', 'Sesotho', 'Shona', 'Sindhi', 'Sinhala', 'Slovak', 'Slovenian', 'Somali', 'Spanish', 'Sundanese', 'Swahili', 'Swedish',
    'Tajik', 'Tamil', 'Tatar', 'Telugu', 'Thai', 'Turkish', 'Turkmen',
    'Ukrainian', 'Urdu', 'Uyghur', 'Uzbek',
    'Vietnamese',
    'Welsh',
    'Xhosa',
    'Yiddish', 'Yoruba',
    'Zulu'
];

export const ISO_LANGUAGE_MAP: Record<string, string> = {
    'Afrikaans': 'af', 'Albanian': 'sq', 'Amharic': 'am', 'Arabic': 'ar', 'Armenian': 'hy', 'Azerbaijani': 'az',
    'Basque': 'eu', 'Belarusian': 'be', 'Bengali': 'bn', 'Bosnian': 'bs', 'Bulgarian': 'bg', 'Burmese': 'my',
    'Catalan': 'ca', 'Cebuano': 'ceb', 'Chinese (Simplified)': 'zh', 'Chinese (Traditional)': 'zh', 'Corsican': 'co', 'Croatian': 'hr', 'Czech': 'cs',
    'Danish': 'da', 'Dutch': 'nl',
    'English': 'en', 'Esperanto': 'eo', 'Estonian': 'et',
    'Filipino': 'tl', 'Finnish': 'fi', 'French': 'fr',
    'Galician': 'gl', 'Georgian': 'ka', 'German': 'de', 'Greek': 'el', 'Gujarati': 'gu',
    'Haitian Creole': 'ht', 'Hausa': 'ha', 'Hawaiian': 'haw', 'Hebrew': 'he', 'Hindi': 'hi', 'Hmong': 'hmn', 'Hungarian': 'hu',
    'Icelandic': 'is', 'Igbo': 'ig', 'Indonesian': 'id', 'Irish': 'ga', 'Italian': 'it',
    'Japanese': 'ja', 'Javanese': 'jv',
    'Kannada': 'kn', 'Kazakh': 'kk', 'Khmer': 'km', 'Kinyarwanda': 'rw', 'Korean': 'ko', 'Kurdish': 'ku', 'Kyrgyz': 'ky',
    'Lao': 'lo', 'Latin': 'la', 'Latvian': 'lv', 'Lithuanian': 'lt', 'Luxembourgish': 'lb',
    'Macedonian': 'mk', 'Malagasy': 'mg', 'Malay': 'ms', 'Malayalam': 'ml', 'Maltese': 'mt', 'Maori': 'mi', 'Marathi': 'mr', 'Mongolian': 'mn',
    'Nepali': 'ne', 'Norwegian': 'no',
    'Odia': 'or',
    'Pashto': 'ps', 'Persian': 'fa', 'Polish': 'pl', 'Portuguese': 'pt', 'Punjabi': 'pa',
    'Romanian': 'ro', 'Russian': 'ru',
    'Samoan': 'sm', 'Scottish Gaelic': 'gd', 'Serbian': 'sr', 'Sesotho': 'st', 'Shona': 'sn', 'Sindhi': 'sd', 'Sinhala': 'si', 'Slovak': 'sk', 'Slovenian': 'sl', 'Somali': 'so', 'Spanish': 'es', 'Sundanese': 'su', 'Swahili': 'sw', 'Swedish': 'sv',
    'Tajik': 'tg', 'Tamil': 'ta', 'Tatar': 'tt', 'Telugu': 'te', 'Thai': 'th', 'Turkish': 'tr', 'Turkmen': 'tk',
    'Ukrainian': 'uk', 'Urdu': 'ur', 'Uyghur': 'ug', 'Uzbek': 'uz',
    'Vietnamese': 'vi',
    'Welsh': 'cy',
    'Xhosa': 'xh',
    'Yiddish': 'yi', 'Yoruba': 'yo',
    'Zulu': 'zu'
};

export function getIsoLanguage(language: string, autoDetect: boolean): string | null {
    if (autoDetect) return null;
    return ISO_LANGUAGE_MAP[language] || null;
}

// Detect text direction
export function detectDirection(text: string): 'rtl' | 'ltr' {
    // Hebrew, Arabic, Persian, Urdu, etc.
    const rtlChars = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    return rtlChars.test(text) ? 'rtl' : 'ltr';
}

export function formatTimeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return 'Just now';

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;

    return new Date(timestamp).toLocaleDateString();
}

// ─── Subtitle style helpers ───────────────────────────────────────────────────

import type { SubtitleStyle } from './types';

/** Convert hex color + alpha (0–1) to CSS rgba() string. */
export function hexToRgba(hex: string, alpha: number): string {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Compute the CSS `text-shadow` value for a SubtitleStyle.
 * Outline = 4-directional stroke; shadow = drop shadow.
 * Both can be combined; per-word inline styles remain unaffected.
 */
export function buildSubtitleTextShadow(style: SubtitleStyle): string {
    const parts: string[] = [];
    if (style.outlineMode === 'outline' || style.outlineMode === 'both') {
        const w = style.outlineWidth;
        const c = style.outlineColor;
        parts.push(
            `-${w}px -${w}px 0 ${c}`,
            `${w}px -${w}px 0 ${c}`,
            `-${w}px ${w}px 0 ${c}`,
            `${w}px ${w}px 0 ${c}`,
        );
    }
    if (style.outlineMode === 'shadow' || style.outlineMode === 'both') {
        parts.push(`${style.shadowOffsetX}px ${style.shadowOffsetY}px ${style.shadowBlur}px ${style.shadowColor}`);
    }
    return parts.length ? parts.join(', ') : 'none';
}

