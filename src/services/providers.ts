import type { AIProvider, TokenUsage } from '../types';

// --- UI Constants ---

export const PROVIDER_LABELS: Record<AIProvider, string> = {
    gemini: 'Google Gemini',
    openai: 'OpenAI',
};

export const MODEL_OPTIONS: Record<AIProvider, { value: string; label: string }[]> = {
    gemini: [
        { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Fast)' },
        { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Best for Foreign Languages)' },
    ],
    openai: [
        { value: 'whisper-1', label: 'Whisper-1 (Standard)' },
        { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Fast)' },
        { value: 'gpt-4o', label: 'GPT-4o (Powerful)' },
    ],
};

export const PROVIDER_KEY_URLS: Record<AIProvider, { label: string; url: string }> = {
    gemini: { label: 'Google AI Studio', url: 'https://aistudio.google.com/app/apikey' },
    openai: { label: 'OpenAI Platform', url: 'https://platform.openai.com/api-keys' },
};

// --- API Key Testing (proxied via main process) ---

export async function testApiKey(
    provider: AIProvider,
    apiKey: string,
): Promise<{ ok: boolean; error?: string }> {
    return window.electronAPI.testApiKey(provider, apiKey);
}

// --- Provider Dispatch (proxied via main process) ---

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
