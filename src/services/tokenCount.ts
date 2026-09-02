import type { AIProvider, TokenUsage } from '../types';

/** Gemini bills audio at a fixed 32 tokens per second. */
export const GEMINI_AUDIO_TOKENS_PER_SEC = 32;

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function firstNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const n = asNumber(record[key]);
    if (n != null) return n;
  }
  return null;
}

export function estimateTextTokens(text: string): number {
  const compact = text.replace(/\s+/g, '').trim();
  if (!compact) return 0;
  return Math.max(1, Math.round(compact.length / 3));
}

export function estimateAudioInputTokens(durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
  return Math.max(1, Math.round(durationSec * GEMINI_AUDIO_TOKENS_PER_SEC));
}

export function audioDurationFromWords(words: { end?: number }[]): number {
  let max = 0;
  for (const word of words) {
    if (typeof word.end === 'number' && Number.isFinite(word.end) && word.end > max) {
      max = word.end;
    }
  }
  return max;
}

export function parseApiTokenUsage(payload: unknown): { inputTokens: number; outputTokens: number } | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  const metaCandidate = root.usageMetadata ?? root.usage_metadata ?? root.usage;
  const meta = (metaCandidate && typeof metaCandidate === 'object')
    ? metaCandidate as Record<string, unknown>
    : root;

  const input = firstNumber(meta, [
    'promptTokenCount',
    'prompt_token_count',
    'total_input_tokens',
    'input_tokens',
    'prompt_tokens',
    'inputTokens',
  ]);
  const output = firstNumber(meta, [
    'candidatesTokenCount',
    'candidates_token_count',
    'total_output_tokens',
    'output_tokens',
    'completion_tokens',
    'outputTokens',
  ]);

  if (input == null && output == null) return null;
  return { inputTokens: input ?? 0, outputTokens: output ?? 0 };
}

export function resolveTokenUsage(opts: {
  payload?: unknown;
  transcript?: string;
  durationSec?: number;
  prompt?: string;
  responseText?: string;
}): { inputTokens: number; outputTokens: number; estimated: boolean } {
  const parsed = parseApiTokenUsage(opts.payload);
  const estimatedOutput = estimateTextTokens(opts.transcript ?? opts.responseText ?? '');
  const estimatedInput = estimateAudioInputTokens(opts.durationSec ?? 0)
    || estimateTextTokens(opts.prompt ?? '');

  if (parsed && (parsed.inputTokens > 0 || parsed.outputTokens > 0)) {
    const inputTokens = parsed.inputTokens > 0 ? parsed.inputTokens : estimatedInput;
    const outputTokens = parsed.outputTokens > 0 ? parsed.outputTokens : estimatedOutput;
    return {
      inputTokens,
      outputTokens,
      estimated: parsed.inputTokens === 0 || parsed.outputTokens === 0,
    };
  }

  return {
    inputTokens: estimatedInput,
    outputTokens: estimatedOutput,
    estimated: true,
  };
}

export function makeTokenUsage(
  provider: AIProvider,
  model: string,
  counts: { inputTokens: number; outputTokens: number; estimated: boolean },
): TokenUsage {
  return {
    provider,
    model,
    timestamp: Date.now(),
    inputTokens: counts.inputTokens,
    outputTokens: counts.outputTokens,
    estimated: counts.estimated,
  };
}
