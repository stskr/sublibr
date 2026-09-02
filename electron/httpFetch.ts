import http from 'node:http';
import https from 'node:https';
import { randomBytes } from 'node:crypto';

type HeaderMap = Record<string, string>;

/** Socket inactivity timeout. Transcription APIs can sit silent for minutes after the audio upload. */
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

export type MainFetchInit = {
  method?: string;
  headers?: HeaderMap;
  body?: string | Buffer | Uint8Array;
  /** Socket inactivity timeout in ms. Defaults to 30 minutes for long transcription calls. */
  timeout?: number;
};

export type MainFetchResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
};

/**
 * HTTPS from the main process must not use Electron `fetch` / `net.fetch`.
 * Chromium's network service in this app crashes (net::ERR_FAILED).
 * Node's http/https modules talk to the APIs on a separate stack.
 */
export function mainFetch(url: string, init: MainFetchInit = {}): Promise<MainFetchResponse> {
  const target = new URL(url);
  const isHttps = target.protocol === 'https:';
  const lib = isHttps ? https : http;
  const method = (init.method || 'GET').toUpperCase();
  const headers: HeaderMap = { ...(init.headers ?? {}) };
  const body = init.body === undefined
    ? undefined
    : Buffer.isBuffer(init.body)
      ? init.body
      : Buffer.from(init.body);

  if (body && !hasHeader(headers, 'content-length')) {
    headers['Content-Length'] = String(body.length);
  }

  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (isHttps ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method,
        headers,
        timeout: init.timeout ?? DEFAULT_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          const status = res.statusCode || 0;
          const text = () => Promise.resolve(buf.toString('utf8'));
          resolve({
            ok: status >= 200 && status < 300,
            status,
            statusText: res.statusMessage || '',
            text,
            json: async () => {
              const raw = await text();
              if (!raw) return {};
              return JSON.parse(raw);
            },
          });
        });
      },
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('ETIMEDOUT'));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

export function encodeMultipart(
  fields: Record<string, string>,
  file?: { fieldName: string; filename: string; contentType: string; data: Uint8Array },
): { contentType: string; body: Buffer } {
  const boundary = `----SublibrBoundary${randomBytes(12).toString('hex')}`;
  const parts: Buffer[] = [];
  const push = (value: string) => parts.push(Buffer.from(value, 'utf8'));

  for (const [name, value] of Object.entries(fields)) {
    push(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
  }
  if (file) {
    push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
    );
    parts.push(Buffer.from(file.data));
    push('\r\n');
  }
  push(`--${boundary}--\r\n`);
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: Buffer.concat(parts),
  };
}

function hasHeader(headers: HeaderMap, name: string): boolean {
  const lower = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === lower);
}
