const MAX_STRING = 8_000;
const MAX_ARRAY = 40;
const MAX_DEPTH = 8;
const SECRET_KEY = /^(apiKey|api_key|authorization|x-api-key|x-goog-api-key|password|token|secret|enc)$/i;
const BASE64ISH = /^[A-Za-z0-9+/=\s]{400,}$/;

export type SessionLevel = 'info' | 'warn' | 'error';

export interface SessionEvent {
  ts: string;
  session: string;
  level: SessionLevel;
  source: 'renderer' | 'main';
  event: string;
  data?: unknown;
}

function truncate(text: string): string {
  if (text.length <= MAX_STRING) return text;
  return `${text.slice(0, MAX_STRING)}…[truncated ${text.length - MAX_STRING} chars]`;
}

function summarizeSubtitleLike(items: unknown[]): unknown {
  const pick = (item: unknown) => {
    if (!item || typeof item !== 'object') return item;
    const row = item as Record<string, unknown>;
    return {
      index: row.index,
      startTime: row.startTime,
      endTime: row.endTime,
      text: typeof row.text === 'string' ? truncate(row.text) : row.text,
    };
  };
  return {
    count: items.length,
    first: pick(items[0]),
    last: pick(items[items.length - 1]),
  };
}

function looksLikeSubtitles(items: unknown[]): boolean {
  const first = items[0];
  return Boolean(
    first
    && typeof first === 'object'
    && first !== null
    && 'text' in first
    && ('startTime' in first || 'start' in first),
  );
}

export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { message: String(error) };
}

export function sanitizeForSessionLog(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (depth > MAX_DEPTH) return '[max-depth]';

  if (typeof value === 'string') {
    if (SECRET_KEY.test(value)) return '[redacted]';
    if (value.startsWith('enc:')) return `[redacted enc ${value.length} chars]`;
    if (value.length > 400 && BASE64ISH.test(value)) {
      return { omitted: 'binary', length: value.length };
    }
    return truncate(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
    return { omitted: 'ArrayBuffer', byteLength: value.byteLength };
  }
  if (typeof Buffer !== 'undefined' && typeof Buffer.isBuffer === 'function' && Buffer.isBuffer(value)) {
    return { omitted: 'Buffer', byteLength: value.length };
  }

  if (Array.isArray(value)) {
    if (looksLikeSubtitles(value)) return summarizeSubtitleLike(value);
    if (value.length > MAX_ARRAY) {
      return {
        count: value.length,
        items: value.slice(0, MAX_ARRAY).map((item) => sanitizeForSessionLog(item, depth + 1)),
        omitted: value.length - MAX_ARRAY,
      };
    }
    return value.map((item) => sanitizeForSessionLog(item, depth + 1));
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(key)) {
        out[key] = typeof nested === 'string' && nested
          ? `[redacted ${nested.length} chars]`
          : '[redacted]';
        continue;
      }
      out[key] = sanitizeForSessionLog(nested, depth + 1);
    }
    return out;
  }

  return String(value);
}

export function settingsSnapshot(settings: unknown): unknown {
  return sanitizeForSessionLog(settings);
}
