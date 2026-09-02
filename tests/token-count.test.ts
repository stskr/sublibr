import { describe, expect, it } from 'vitest';
import {
  audioDurationFromWords,
  estimateAudioInputTokens,
  estimateTextTokens,
  parseApiTokenUsage,
  resolveTokenUsage,
} from '../src/services/tokenCount';

describe('token counting', () => {
  it('reads Gemini generateContent usageMetadata', () => {
    expect(parseApiTokenUsage({
      usageMetadata: { promptTokenCount: 1920, candidatesTokenCount: 88 },
    })).toEqual({ inputTokens: 1920, outputTokens: 88 });
  });

  it('reads Gemini interactions usage', () => {
    expect(parseApiTokenUsage({
      usage: { total_input_tokens: 640, total_output_tokens: 40 },
    })).toEqual({ inputTokens: 640, outputTokens: 40 });
  });

  it('reads OpenAI chat usage', () => {
    expect(parseApiTokenUsage({
      usage: { prompt_tokens: 437, completion_tokens: 275 },
    })).toEqual({ inputTokens: 437, outputTokens: 275 });
  });

  it('reads OpenAI transcription token usage', () => {
    expect(parseApiTokenUsage({
      usage: { type: 'tokens', input_tokens: 800, output_tokens: 120 },
    })).toEqual({ inputTokens: 800, outputTokens: 120 });
  });

  it('estimates Gemini-style audio input at 32 tokens per second', () => {
    expect(estimateAudioInputTokens(10)).toBe(320);
    expect(audioDurationFromWords([{ end: 1.2 }, { end: 4.5 }, { end: 3 }])).toBe(4.5);
  });

  it('fills missing output from the transcript when the API reports input only', () => {
    const result = resolveTokenUsage({
      payload: { usageMetadata: { promptTokenCount: 1920, candidatesTokenCount: 0 } },
      transcript: 'Hello world this is a test',
      durationSec: 10,
    });
    expect(result.inputTokens).toBe(1920);
    expect(result.outputTokens).toBeGreaterThan(0);
    expect(result.estimated).toBe(true);
  });

  it('estimates both sides when the API omits usage', () => {
    const result = resolveTokenUsage({
      transcript: 'Hello world this is a longer line of speech',
      durationSec: 5,
    });
    expect(result.inputTokens).toBe(160);
    expect(result.outputTokens).toBe(estimateTextTokens('Hello world this is a longer line of speech'));
    expect(result.estimated).toBe(true);
  });

  it('estimates translator tokens from prompt and reply', () => {
    const result = resolveTokenUsage({
      prompt: 'Translate these lines into Spanish please',
      responseText: 'Traduce estas lineas por favor',
    });
    expect(result.inputTokens).toBeGreaterThan(0);
    expect(result.outputTokens).toBeGreaterThan(0);
    expect(result.estimated).toBe(true);
  });
});
