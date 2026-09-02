import type { AIProvider, TokenUsage, ImportedLocalModel } from '../types';
import { catalogWeightId, LOCAL_WEIGHTS, persistedLocalId } from './localModelCatalog';

export const PROVIDER_LABELS: Record<AIProvider, string> = {
    gemini: 'Google Gemini',
    openai: 'OpenAI',
    local: 'Local',
};

export const CLOUD_PROVIDERS: AIProvider[] = ['gemini', 'openai'];

export function providerNeedsApiKey(provider: AIProvider): boolean {
    return provider !== 'local';
}

export const MODEL_OPTIONS: Record<AIProvider, { value: string; label: string }[]> = {
    gemini: [
        { value: 'gemini-3.5-transcribe', label: 'Gemini 3.5 Transcribe' },
    ],
    openai: [
        { value: 'whisper-1', label: 'Whisper' },
    ],
    local: [
        { value: 'whisper-large-v3-turbo', label: 'Whisper Large v3 Turbo' },
    ],
};

export const TRANSLATOR_MODEL_OPTIONS: Record<AIProvider, { value: string; label: string }[]> = {
    gemini: [
        { value: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash (Fast)' },
        { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Best for languages)' },
    ],
    openai: [
        { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Fast)' },
        { value: 'gpt-4o', label: 'GPT-4o (Powerful)' },
    ],
    local: [
        { value: 'qwen2.5-7b-instruct', label: 'Qwen2.5 7B (local translator)' },
    ],
};

/** Hard limits from each STT API. Send the whole file when it fits; chunk only above these. */
export const TRANSCRIBE_LIMITS: Record<AIProvider, { maxDurationSec: number; maxBytes: number }> = {
    // Word timestamps drop the recorded-audio cap from 60 min to 30 min. Inline payload cap is 20 MB
    // (base64 inflates ~4/3), so keep the source file under ~14 MB.
    gemini: { maxDurationSec: 28 * 60, maxBytes: 14 * 1024 * 1024 },
    // whisper-1 is capped by file size (25 MB), not the ~25 min gpt-transcribe duration limit.
    openai: { maxDurationSec: 50 * 60, maxBytes: 24 * 1024 * 1024 },
    // Local whisper.cpp has no API file cap. Keep chunks bounded so pause/progress still work.
    local: { maxDurationSec: 20 * 60, maxBytes: 80 * 1024 * 1024 },
};

/** Retired IDs still sitting in saved settings → current transcription models. */
export const LEGACY_MODEL_MAP: Record<string, string> = {
    'gemini-2.5-flash': 'gemini-3.5-transcribe',
    'gemini-2.5-pro': 'gemini-3.5-transcribe',
    'gemini-3.6-flash': 'gemini-3.5-transcribe',
    'gemini-3.1-pro-preview': 'gemini-3.5-transcribe',
    'gpt-transcribe': 'whisper-1',
    'gpt-4o-mini-transcribe': 'whisper-1',
    'gpt-4o-transcribe': 'whisper-1',
    'gpt-4o-mini': 'whisper-1',
    'gpt-4o': 'whisper-1',
    'gpt-4o-audio-preview': 'whisper-1',
    'gpt-4o-mini-audio-preview': 'whisper-1',
    'gpt-audio-1.5': 'whisper-1',
};

/** If the preferred ID 404s, try these in order (AI Studio vs Vertex naming). */
export const MODEL_FALLBACKS: Record<string, string[]> = {
    'gemini-3.5-transcribe': ['gemini-3.5-transcribe', 'gemini-3.5-transcribe-preview'],
    'whisper-1': ['whisper-1'],
    'gemini-3.6-flash': ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-flash-latest'],
    'gemini-3.1-pro-preview': ['gemini-3.1-pro-preview', 'gemini-pro-latest'],
    'gemini-flash-latest': ['gemini-flash-latest', 'gemini-3.6-flash', 'gemini-3.5-flash'],
    'gpt-4o-mini': ['gpt-4o-mini', 'gpt-4.1-mini'],
    'gpt-4o': ['gpt-4o', 'gpt-4o-2024-11-20'],
};

const ASR_MODELS = new Set([
    'gemini-3.5-transcribe',
    'gemini-3.5-transcribe-preview',
    'whisper-1',
    'ivrit-whisper-large-v3-turbo',
    'whisper-large-v3-turbo',
]);

export function isAsrModel(model: string): boolean {
    return ASR_MODELS.has(model) || model.includes('transcribe');
}

export const LOCAL_WHISPER_MULTILINGUAL = 'whisper-large-v3-turbo';
export const LOCAL_WHISPER_HEBREW = 'ivrit-whisper-large-v3-turbo';

export function isKnownLocalWhisperId(model: string, imported: ImportedLocalModel[] = []): boolean {
    const weight = catalogWeightId(model);
    if (weight && LOCAL_WEIGHTS[weight].for === 'transcribe') return true;
    return imported.some((item) => item.id === model && item.runtime === 'whisper');
}

export function isKnownLocalTranslatorId(model: string, imported: ImportedLocalModel[] = []): boolean {
    const weight = catalogWeightId(model);
    if (weight && LOCAL_WEIGHTS[weight].for === 'translate') return true;
    return imported.some((item) => item.id === model && item.runtime === 'llama');
}

/** Turbo for every language. Optional Hebrew weights are a Models-tab pick, not an automatic switch. */
export function resolveLocalWhisperModel(_language: string, selected?: string): string {
    return selected || LOCAL_WHISPER_MULTILINGUAL;
}

export function localWhisperSelectOptions(
    imported: ImportedLocalModel[],
    presentIds: Set<string>,
    selected: string,
): { value: string; label: string }[] {
    return localSelectOptions('transcribe', imported, presentIds, selected);
}

export function localTranslatorSelectOptions(
    imported: ImportedLocalModel[],
    presentIds: Set<string>,
    selected: string,
): { value: string; label: string }[] {
    return localSelectOptions('translate', imported, presentIds, selected);
}

function localSelectOptions(
    kind: 'transcribe' | 'translate',
    imported: ImportedLocalModel[],
    presentIds: Set<string>,
    selected: string,
): { value: string; label: string }[] {
    const selectedWeight = catalogWeightId(selected);
    const options: { value: string; label: string }[] = [];
    const seen = new Set<string>();

    for (const spec of Object.values(LOCAL_WEIGHTS)) {
        if (spec.for !== kind) continue;
        const value = persistedLocalId(spec.id);
        if (seen.has(value)) continue;
        const isSelected = selected === value || selectedWeight === spec.id;
        if (spec.tier === 'recommended' || presentIds.has(spec.id) || isSelected) {
            seen.add(value);
            options.push({ value, label: spec.label });
        }
    }

    for (const item of imported) {
        if ((kind === 'transcribe' ? 'whisper' : 'llama') !== item.runtime) continue;
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        options.push({ value: item.id, label: `${item.label} (added)` });
    }

    return options;
}

export function transcriptionModelLabel(provider: AIProvider, model: string, imported: ImportedLocalModel[] = []): string {
    if (provider === 'local') {
        const weight = catalogWeightId(model);
        if (weight) return LOCAL_WEIGHTS[weight].label;
        const hit = imported.find((item) => item.id === model);
        if (hit) return hit.label;
    }
    if (model === LOCAL_WHISPER_HEBREW || model === LOCAL_WHISPER_MULTILINGUAL) {
        return 'Whisper Large v3 Turbo';
    }
    return MODEL_OPTIONS[provider]?.find(m => m.value === model)?.label ?? model;
}

export function sessionModelLabel(provider: AIProvider, model: string, imported: ImportedLocalModel[] = []): string {
    const stt = MODEL_OPTIONS[provider]?.find(m => m.value === model)?.label;
    if (stt) return stt;
    const translator = TRANSLATOR_MODEL_OPTIONS[provider]?.find(m => m.value === model)?.label;
    if (translator) return translator.replace(' (local translator)', '').replace(' (offline translator)', '');
    return transcriptionModelLabel(provider, model, imported);
}

export function resolveSavedModel(provider: AIProvider, model: string, imported: ImportedLocalModel[] = []): string {
    const mapped = LEGACY_MODEL_MAP[model] ?? model;
    if (provider === 'local') {
        return isKnownLocalWhisperId(mapped, imported) ? mapped : MODEL_OPTIONS.local[0].value;
    }
    const valid = MODEL_OPTIONS[provider].some(m => m.value === mapped);
    return valid ? mapped : MODEL_OPTIONS[provider][0].value;
}

export function resolveSavedTranslatorModel(provider: AIProvider, model: string, imported: ImportedLocalModel[] = []): string {
    const options = TRANSLATOR_MODEL_OPTIONS[provider];
    if (!options.length) {
        return TRANSLATOR_MODEL_OPTIONS.gemini[0].value;
    }
    if (provider === 'local') {
        return isKnownLocalTranslatorId(model, imported) ? model : options[0].value;
    }
    const valid = options.some(m => m.value === model);
    return valid ? model : options[0].value;
}

export function modelsToTry(model: string): string[] {
    return MODEL_FALLBACKS[model] ?? [model];
}

/** Dedicated STT models cannot do text-to-text (translate). */
export function textFallbackModel(provider: AIProvider, model: string): string {
    if (provider === 'local' || isAsrModel(model)) {
        const cloud = TRANSLATOR_MODEL_OPTIONS[provider]?.[0]?.value
            ?? TRANSLATOR_MODEL_OPTIONS.gemini[0].value;
        return cloud;
    }
    return model;
}

export function transcriptionChoiceLabel(provider: AIProvider, modelLabel: string): string {
    if (provider === 'local') return `Local — ${modelLabel}`;
    return `${PROVIDER_LABELS[provider]} (cloud) — ${modelLabel}`;
}

export function isTranscriptionReady(
    provider: AIProvider,
    config: { enabled: boolean; apiKey: string },
    localWhisperOk?: boolean | null,
): boolean {
    if (provider === 'local') return localWhisperOk === true;
    return Boolean(config.apiKey.trim());
}

export const PROVIDER_KEY_URLS: Record<AIProvider, { label: string; url: string }> = {
    gemini: { label: 'Google AI Studio', url: 'https://aistudio.google.com/apikey' },
    openai: { label: 'OpenAI Platform', url: 'https://platform.openai.com/api-keys' },
    local: { label: 'ivrit.ai', url: 'https://huggingface.co/ivrit-ai' },
};

export async function callLocalTranscribe(
    filePath: string,
    language?: string | null,
    model?: string,
): Promise<ProviderResponse> {
    const result = await window.electronAPI.callLocalTranscribe(filePath, language, model);
    return {
        ...result,
        tokenUsage: { ...result.tokenUsage, provider: 'local' } as TokenUsage,
    };
}

export async function testApiKey(
    provider: AIProvider,
    apiKey: string,
): Promise<{ ok: boolean; error?: string; llm?: boolean; llmError?: string }> {
    return window.electronAPI.testApiKey(provider, apiKey);
}

export interface ProviderResponse {
    text: string;
    tokenUsage: TokenUsage;
}

export async function callProvider(
    provider: AIProvider,
    apiKey: string,
    model: string,
    prompt: string,
    audioBase64: string,
    audioFormat?: string,
    language?: string | null,
    previousTranscript?: string,
): Promise<ProviderResponse> {
    const result = await window.electronAPI.callProvider(provider, apiKey, model, prompt, audioBase64, audioFormat, language, previousTranscript);
    return {
        ...result,
        tokenUsage: { ...result.tokenUsage, provider } as TokenUsage,
    };
}

export async function callTextProvider(
    provider: AIProvider,
    apiKey: string,
    model: string,
    prompt: string,
): Promise<ProviderResponse> {
    const result = await window.electronAPI.callTextProvider(provider, apiKey, model, prompt);
    return {
        ...result,
        tokenUsage: { ...result.tokenUsage, provider } as TokenUsage,
    };
}
