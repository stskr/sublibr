import fs from 'fs';
import http from 'node:http';
import https from 'node:https';
import path from 'path';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { LOCAL_WEIGHTS, type LocalWeightId } from '../src/services/localModelCatalog';
import { ensureWritableModelsDir, resolveWeightFile } from './localModelPaths';

const MAX_REDIRECTS = 8;
const IDLE_MS = 120_000;
const USER_AGENT = 'Sublibr/1.0 (model-download)';

export type ModelFileStatus = {
  id: LocalWeightId;
  file: string;
  present: boolean;
  bytesOnDisk: number;
  bytesExpected: number;
  dest: string;
};

export type DownloadProgress = {
  id: LocalWeightId;
  received: number;
  total: number;
  percent: number;
  status: 'downloading' | 'done' | 'error' | 'cancelled';
  error?: string;
};

type ActiveDownload = {
  id: LocalWeightId;
  req: ClientRequest | null;
  cancelled: boolean;
};

const active = new Map<LocalWeightId, ActiveDownload>();
const listeners = new Set<(progress: DownloadProgress) => void>();

export function onModelDownloadProgress(listener: (progress: DownloadProgress) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function emit(progress: DownloadProgress): void {
  for (const listener of listeners) listener(progress);
}

export function listModelFiles(): ModelFileStatus[] {
  const dir = ensureWritableModelsDir();
  return (Object.keys(LOCAL_WEIGHTS) as LocalWeightId[]).map((id) => {
    const spec = LOCAL_WEIGHTS[id];
    const found = resolveWeightFile(spec.file);
    const bytesOnDisk = found ? fs.statSync(found).size : 0;
    return {
      id,
      file: spec.file,
      present: Boolean(found && bytesOnDisk > 1_000_000),
      bytesOnDisk,
      bytesExpected: spec.bytes,
      dest: found ?? path.join(dir, spec.file),
    };
  });
}

export function cancelModelDownload(id: LocalWeightId): boolean {
  const job = active.get(id);
  if (!job) return false;
  job.cancelled = true;
  job.req?.destroy();
  return true;
}

export async function downloadModelWeight(
  id: LocalWeightId,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<ModelFileStatus> {
  const spec = LOCAL_WEIGHTS[id];
  if (!spec) throw new Error(`Unknown model: ${id}`);
  if (active.has(id)) throw new Error('That model is already downloading.');

  const existing = listModelFiles().find((item) => item.id === id);
  if (existing?.present) return existing;

  const dir = ensureWritableModelsDir();
  const dest = path.join(dir, spec.file);
  const partial = `${dest}.partial`;
  const job: ActiveDownload = { id, req: null, cancelled: false };
  active.set(id, job);

  const send = (progress: DownloadProgress) => {
    onProgress?.(progress);
    emit(progress);
  };

  try {
    const started = fs.existsSync(partial) ? fs.statSync(partial).size : 0;
    await fetchToFile(spec.url, partial, started, job, (received, total) => {
      const percent = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0;
      send({ id, received, total, percent, status: 'downloading' });
    });

    if (job.cancelled) {
      send({ id, received: 0, total: spec.bytes, percent: 0, status: 'cancelled' });
      throw new Error('Download cancelled');
    }

    const size = fs.statSync(partial).size;
    if (size < 50_000_000) {
      throw new Error('Download incomplete. Try again.');
    }
    fs.renameSync(partial, dest);
    send({ id, received: size, total: size, percent: 100, status: 'done' });
    return listModelFiles().find((item) => item.id === id)!;
  } catch (error) {
    if (!job.cancelled) {
      const message = error instanceof Error ? error.message : 'Download failed';
      send({ id, received: 0, total: spec.bytes, percent: 0, status: 'error', error: message });
    }
    throw error;
  } finally {
    active.delete(id);
  }
}

function fetchToFile(
  url: string,
  dest: string,
  resumeFrom: number,
  job: ActiveDownload,
  onBytes: (received: number, total: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let hops = 0;

    const go = (target: string, resume: number) => {
      if (job.cancelled) {
        reject(new Error('Download cancelled'));
        return;
      }
      hops += 1;
      if (hops > MAX_REDIRECTS) {
        reject(new Error('Too many redirects'));
        return;
      }

      const parsed = new URL(target);
      const lib = parsed.protocol === 'http:' ? http : https;
      const headers: Record<string, string> = {
        'User-Agent': USER_AGENT,
        Accept: '*/*',
      };
      if (resume > 0) headers.Range = `bytes=${resume}-`;

      const req = lib.get(
        {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port,
          path: `${parsed.pathname}${parsed.search}`,
          headers,
        },
        (res) => {
          const status = res.statusCode ?? 0;
          const location = res.headers.location;
          if (status >= 300 && status < 400 && location) {
            res.resume();
            const next = new URL(location, target).toString();
            go(next, resume);
            return;
          }

          if (status === 416 && resume > 0) {
            res.resume();
            resolve();
            return;
          }

          if (status !== 200 && status !== 206) {
            res.resume();
            reject(new Error(`Download failed (HTTP ${status})`));
            return;
          }

          const contentLength = Number(res.headers['content-length'] || 0);
          const total = status === 206
            ? resume + contentLength
            : (contentLength || 0);
          const startAt = status === 206 ? resume : 0;
          if (status === 200 && resume > 0) {
            try { fs.unlinkSync(dest); } catch { /* fresh download */ }
          }

          const stream = fs.createWriteStream(dest, { flags: startAt > 0 ? 'a' : 'w' });
          let received = startAt;
          const bumpIdle = () => {
            req.setTimeout(IDLE_MS);
          };
          bumpIdle();

          res.on('data', (chunk: Buffer) => {
            received += chunk.length;
            bumpIdle();
            onBytes(received, total || received);
          });
          res.pipe(stream);
          stream.on('finish', () => resolve());
          stream.on('error', reject);
          res.on('error', reject);
        },
      );

      job.req = req;
      req.setTimeout(IDLE_MS, () => {
        req.destroy(new Error('Download stalled'));
      });
      req.on('error', reject);
    };

    go(url, resumeFrom);
  });
}

export function isDownloading(id: LocalWeightId): boolean {
  return active.has(id);
}
