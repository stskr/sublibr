import { WHISPER_PUNCTUATION_PROMPT } from '../src/prompts/whisper';
import { modelsToTry, textFallbackModel } from '../src/services/providers';
import { audioDurationFromWords, makeTokenUsage, resolveTokenUsage } from '../src/services/tokenCount';
import { encodeMultipart, mainFetch } from './httpFetch';

type Word = { start: number; end: number; word: string };

function parseOffset(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object') {
    const obj = value as { seconds?: number | string; nanos?: number };
    const seconds = Number(obj.seconds ?? 0);
    const nanos = Number(obj.nanos ?? 0);
    return seconds + nanos / 1e9;
  }
  if (typeof value !== 'string') return 0;
  const s = value.trim();
  if (s.endsWith('ms')) return parseFloat(s) / 1000;
  if (s.endsWith('s')) return parseFloat(s);
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function collectWords(node: unknown, words: Word[], seen: WeakSet<object>): void {
  if (!node || typeof node !== 'object') return;
  if (seen.has(node as object)) return;
  seen.add(node as object);

  const obj = node as Record<string, unknown>;
  const type = String(obj.type ?? '');
  const text = String(obj.text ?? obj.word ?? '');
  const startRaw = obj.start_offset ?? obj.startOffset ?? obj.start;
  const endRaw = obj.end_offset ?? obj.endOffset ?? obj.end;

  if (type === 'word_info' || (typeof obj.word === 'string' && startRaw !== undefined)) {
    words.push({
      word: type === 'word_info' ? text : String(obj.word),
      start: parseOffset(startRaw),
      end: parseOffset(endRaw),
    });
  }

  for (const value of Object.values(obj)) {
    if (Array.isArray(value)) {
      for (const item of value) collectWords(item, words, seen);
    } else if (value && typeof value === 'object') {
      collectWords(value, words, seen);
    }
  }
}

function collectText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const obj = node as Record<string, unknown>;
  if (typeof obj.output_text === 'string' && obj.output_text.trim()) return obj.output_text;
  if (typeof obj.text === 'string' && obj.type === 'text') return obj.text;

  const parts: string[] = [];
  if (Array.isArray(obj.outputs)) {
    for (const item of obj.outputs) {
      const t = collectText(item);
      if (t) parts.push(t);
    }
  }
  if (Array.isArray(obj.candidates)) {
    for (const item of obj.candidates) {
      const t = collectText(item);
      if (t) parts.push(t);
    }
  }
  if (obj.content && typeof obj.content === 'object') {
    const t = collectText(obj.content);
    if (t) parts.push(t);
  }
  if (Array.isArray(obj.parts)) {
    for (const item of obj.parts) {
      const t = collectText(item);
      if (t) parts.push(t);
    }
  }
  if (typeof obj.text === 'string' && !obj.type) parts.push(obj.text);
  return parts.filter(Boolean).join('\n').trim();
}

function toBcp47(iso: string): string {
  const withRegion: Record<string, string> = {
    en: 'en-US', he: 'he-IL', iw: 'he-IL', es: 'es-ES', pt: 'pt-BR',
    zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR', fr: 'fr-FR', de: 'de-DE',
    ar: 'ar-SA', ru: 'ru-RU', it: 'it-IT', hi: 'hi-IN',
  };
  return withRegion[iso] ?? iso;
}

function requireTimedWords(model: string, words: Word[], extraTimed = false, transcript = ''): void {
  if (words.length > 0 || extraTimed) return;
  if (!transcript.trim()) return;
  throw new Error(
    `${model} returned a transcript with no timestamps. Subtitles need word-level times from the API — this result cannot be used.`,
  );
}

function isUnavailable(status: number, message: string): boolean {
  return status === 404 || /not found|not available|NOT_FOUND|no longer available/i.test(message);
}

function apiErrorMessage(payload: unknown, fallback: string): string {
  const err = payload as { error?: { message?: string } };
  return err?.error?.message || fallback;
}

export async function callGeminiAudio(
  apiKey: string,
  model: string,
  _prompt: string,
  audioBase64: string,
  mimeType: string,
  language?: string | null,
) {
  return callGeminiTranscribe(apiKey, model, audioBase64, mimeType, language);
}

async function callGeminiTranscribe(
  apiKey: string,
  model: string,
  audioBase64: string,
  mimeType: string,
  language?: string | null,
) {
  const languageHints = language ? [toBcp47(language)] : ['auto'];
  let lastError: Error | null = null;

  for (const candidate of modelsToTry(model)) {
    try {
      return await callGeminiInteractions(apiKey, candidate, audioBase64, mimeType, languageHints, model);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (!isUnavailable(0, lastError.message)) {
        // Interactions may not be enabled; try generateContent
      }
    }

    try {
      return await callGeminiGenerateContentTranscribe(apiKey, candidate, audioBase64, mimeType, languageHints, model);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (!isUnavailable(0, lastError.message)) throw lastError;
    }
  }

  throw lastError ?? new Error(`Gemini Transcribe model ${model} is not available`);
}

async function callGeminiInteractions(
  apiKey: string,
  candidate: string,
  audioBase64: string,
  mimeType: string,
  languageHints: string[],
  requestedModel: string,
) {
  const res = await mainFetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: candidate,
      input: [{ type: 'audio', data: audioBase64, mime_type: mimeType }],
      generation_config: {
        transcription_config: {
          language_hints: languageHints,
          timestamp_granularities: ['word'],
          mode: { type: 'verbatim', timestamp_granularities: ['word'] },
        },
      },
    }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(apiErrorMessage(payload, `HTTP ${res.status}`));
  }

  const words: Word[] = [];
  collectWords(payload, words, new WeakSet());
  const text = collectText(payload);
  requireTimedWords(requestedModel, words, false, text);

  return {
    text: JSON.stringify({ text, words }),
    tokenUsage: makeTokenUsage(
      'gemini',
      requestedModel,
      resolveTokenUsage({ payload, transcript: text, durationSec: audioDurationFromWords(words) }),
    ),
  };
}

async function callGeminiGenerateContentTranscribe(
  apiKey: string,
  candidate: string,
  audioBase64: string,
  mimeType: string,
  languageHints: string[],
  requestedModel: string,
) {
  const res = await mainFetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${candidate}:generateContent`,
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ inlineData: { mimeType, data: audioBase64 } }],
        }],
        generationConfig: {
          audioTranscriptionConfig: {
            wordTimestamp: true,
            languageCodes: languageHints,
          },
        },
      }),
    },
  );

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(apiErrorMessage(payload, `HTTP ${res.status}`));
  }

  const words: Word[] = [];
  collectWords(payload, words, new WeakSet());
  const text = collectText(payload);
  requireTimedWords(requestedModel, words, false, text);

  return {
    text: JSON.stringify({ text, words }),
    tokenUsage: makeTokenUsage(
      'gemini',
      requestedModel,
      resolveTokenUsage({ payload, transcript: text, durationSec: audioDurationFromWords(words) }),
    ),
  };
}

export async function callGeminiText(apiKey: string, model: string, prompt: string) {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const resolved = textFallbackModel('gemini', model);
  let lastError: Error | null = null;

  for (const candidate of modelsToTry(resolved)) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const geminiModel = genAI.getGenerativeModel({ model: candidate });
      const result = await geminiModel.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      return {
        text,
        tokenUsage: makeTokenUsage(
          'gemini',
          model,
          resolveTokenUsage({
            payload: { usageMetadata: response.usageMetadata },
            prompt,
            responseText: text,
          }),
        ),
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (!isUnavailable(0, lastError.message)) throw lastError;
    }
  }

  throw lastError ?? new Error(`Gemini model ${resolved} is not available`);
}

export async function callOpenAiAudio(
  apiKey: string,
  model: string,
  _prompt: string,
  audioBase64: string,
  audioFormat: string,
  mimeType: string,
  language?: string | null,
  previousTranscript?: string,
) {
  return callOpenAiTranscriptions(apiKey, model, audioBase64, audioFormat, mimeType, language, previousTranscript);
}

async function callOpenAiTranscriptions(
  apiKey: string,
  model: string,
  audioBase64: string,
  audioFormat: string,
  mimeType: string,
  language?: string | null,
  previousTranscript?: string,
) {
  // Only whisper-1 returns word timestamps. gpt-transcribe / gpt-4o-transcribe return text only.
  const candidate = 'whisper-1';
  const buffer = Buffer.from(audioBase64, 'base64');
  const fields: Record<string, string> = {
    model: candidate,
    response_format: 'verbose_json',
    'timestamp_granularities[]': 'word',
  };

  let finalPrompt = WHISPER_PUNCTUATION_PROMPT;
  if (previousTranscript) {
    finalPrompt = `${previousTranscript}\n\n${finalPrompt}`;
  }
  fields.prompt = finalPrompt;
  if (language) fields.language = language;

  const { contentType, body } = encodeMultipart(fields, {
    fieldName: 'file',
    filename: `audio.${audioFormat}`,
    contentType: mimeType,
    data: new Uint8Array(buffer),
  });

  const res = await mainFetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': contentType,
    },
    body,
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`OpenAI API error: ${apiErrorMessage(payload, res.statusText)}`);
  }

  const data = payload as {
    text: string;
    duration?: number;
    words?: { start: number; end: number; word: string }[];
    segments?: { start: number; end: number; text: string }[];
    usage?: unknown;
  };

  requireTimedWords(model, data.words ?? [], Boolean(data.segments?.length), data.text ?? '');
  const durationSec = typeof data.duration === 'number'
    ? data.duration
    : audioDurationFromWords(data.words ?? []);

  return {
    text: JSON.stringify(data),
    tokenUsage: makeTokenUsage(
      'openai',
      model,
      resolveTokenUsage({ payload, transcript: data.text ?? '', durationSec }),
    ),
  };
}

export async function callOpenAiText(apiKey: string, model: string, prompt: string) {
  const resolved = textFallbackModel('openai', model);
  let lastError: Error | null = null;

  for (const candidate of modelsToTry(resolved)) {
    const res = await mainFetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: candidate,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = apiErrorMessage(payload, res.statusText);
      lastError = new Error(`OpenAI API error: ${message}`);
      if (isUnavailable(res.status, message) || /does not support|invalid model/i.test(message)) continue;
      throw lastError;
    }

    const data = payload as {
      choices: { message: { content: string } }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    return {
      text: data.choices[0]?.message?.content || '',
      tokenUsage: makeTokenUsage(
        'openai',
        model,
        resolveTokenUsage({
          payload,
          prompt,
          responseText: data.choices[0]?.message?.content || '',
        }),
      ),
    };
  }

  throw lastError ?? new Error(`OpenAI model ${resolved} is not available`);
}
