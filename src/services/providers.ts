import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AIProvider } from '../types';

// --- UI Constants ---

export const PROVIDER_LABELS: Record<AIProvider, string> = {
    gemini: 'Google Gemini',
    anthropic: 'Anthropic Claude',
    openai: 'OpenAI',
};

export const MODEL_OPTIONS: Record<AIProvider, { value: string; label: string }[]> = {
    gemini: [
        { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Fast)' },
        { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Powerful)' },
    ],
    anthropic: [
        { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
        { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (Fast)' },
    ],
    openai: [
        { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Fast)' },
        { value: 'gpt-4o', label: 'GPT-4o (Powerful)' },
    ],
};

export const PROVIDER_KEY_URLS: Record<AIProvider, { label: string; url: string }> = {
    gemini: { label: 'Google AI Studio', url: 'https://aistudio.google.com/app/apikey' },
    anthropic: { label: 'Anthropic Console', url: 'https://console.anthropic.com/settings/keys' },
    openai: { label: 'OpenAI Platform', url: 'https://platform.openai.com/api-keys' },
};

// --- API Key Testing ---

export async function testApiKey(
    provider: AIProvider,
    apiKey: string,
): Promise<{ ok: boolean; error?: string }> {
    try {
        switch (provider) {
            case 'gemini': {
                const res = await fetch(
                    'https://generativelanguage.googleapis.com/v1beta/models',
                    { headers: { 'x-goog-api-key': apiKey } },
                );
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    return { ok: false, error: err.error?.message || `HTTP ${res.status}` };
                }
                return { ok: true };
            }
            case 'anthropic': {
                const res = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01',
                        'anthropic-dangerous-direct-browser-access': 'true',
                    },
                    body: JSON.stringify({
                        model: 'claude-haiku-4-5-20251001',
                        max_tokens: 1,
                        messages: [{ role: 'user', content: 'ping' }],
                    }),
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    return { ok: false, error: err.error?.message || `HTTP ${res.status}` };
                }
                return { ok: true };
            }
            case 'openai': {
                const res = await fetch('https://api.openai.com/v1/models', {
                    headers: { 'Authorization': `Bearer ${apiKey}` },
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    return { ok: false, error: err.error?.message || `HTTP ${res.status}` };
                }
                return { ok: true };
            }
        }
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
    }
}

// --- Provider Dispatch ---

export async function callProvider(
    provider: AIProvider,
    apiKey: string,
    model: string,
    prompt: string,
    audioBase64: string,
): Promise<string> {
    switch (provider) {
        case 'gemini':
            return callGemini(apiKey, model, prompt, audioBase64);
        case 'anthropic':
            return callAnthropic(apiKey, model, prompt, audioBase64);
        case 'openai':
            return callOpenAI(apiKey, model, prompt, audioBase64);
    }
}

// --- Gemini (existing SDK logic) ---

async function callGemini(
    apiKey: string,
    model: string,
    prompt: string,
    audioBase64: string,
): Promise<string> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const geminiModel = genAI.getGenerativeModel({ model });

    const result = await geminiModel.generateContent([
        prompt,
        {
            inlineData: {
                mimeType: 'audio/flac',
                data: audioBase64,
            },
        },
    ]);

    const response = await result.response;
    return response.text();
}

// --- Anthropic (fetch) ---

async function callAnthropic(
    apiKey: string,
    model: string,
    prompt: string,
    audioBase64: string,
): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
            model,
            max_tokens: 8192,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'document',
                            source: {
                                type: 'base64',
                                media_type: 'audio/flac',
                                data: audioBase64,
                            },
                        },
                        {
                            type: 'text',
                            text: prompt,
                        },
                    ],
                },
            ],
        }),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
        throw new Error(`Anthropic API error: ${err.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const textBlock = data.content?.find((b: { type: string }) => b.type === 'text');
    return textBlock?.text ?? '';
}

// --- OpenAI (fetch) ---

async function callOpenAI(
    apiKey: string,
    model: string,
    prompt: string,
    audioBase64: string,
): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'input_audio',
                            input_audio: {
                                data: audioBase64,
                                format: 'flac',
                            },
                        },
                        {
                            type: 'text',
                            text: prompt,
                        },
                    ],
                },
            ],
        }),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
        throw new Error(`OpenAI API error: ${err.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? '';
}
