import { describe, expect, it } from 'vitest';
import { sanitizeForSessionLog, serializeError } from '../src/services/sessionSanitize';

describe('session log sanitizer', () => {
  it('redacts API keys and auth headers', () => {
    const out = sanitizeForSessionLog({
      providers: {
        gemini: { apiKey: 'secret-key-value', model: 'gemini-3.5-transcribe' },
      },
      headers: { Authorization: 'Bearer sk-live-123' },
    }) as Record<string, unknown>;
    const providers = out.providers as { gemini: { apiKey: string; model: string } };
    expect(providers.gemini.apiKey).toMatch(/redacted/);
    expect(providers.gemini.apiKey).not.toContain('secret-key-value');
    expect(providers.gemini.model).toBe('gemini-3.5-transcribe');
  });

  it('omits huge base64 payloads', () => {
    const audio = 'A'.repeat(800);
    const out = sanitizeForSessionLog({ audioBase64: audio }) as { audioBase64: { omitted: string; length: number } };
    expect(out.audioBase64).toEqual({ omitted: 'binary', length: 800 });
  });

  it('summarizes subtitle arrays instead of dumping every cue', () => {
    const cues = Array.from({ length: 12 }, (_, i) => ({
      index: i + 1,
      startTime: i,
      endTime: i + 1,
      text: `line ${i}`,
    }));
    const out = sanitizeForSessionLog(cues) as { count: number; first: { text: string }; last: { text: string } };
    expect(out.count).toBe(12);
    expect(out.first.text).toBe('line 0');
    expect(out.last.text).toBe('line 11');
  });

  it('serializes errors with a stack', () => {
    const err = serializeError(new Error('boom'));
    expect(err.message).toBe('boom');
    expect(String(err.stack)).toContain('Error: boom');
  });
});
