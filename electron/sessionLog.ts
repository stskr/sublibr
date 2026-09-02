import { app } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { IpcMain } from 'electron';
import { saveProject } from './projects';
import {
  sanitizeForSessionLog,
  serializeError,
  type SessionEvent,
  type SessionLevel,
} from '../src/services/sessionSanitize';

const MAX_SESSIONS = 20;
const BUFFER_LIMIT = 300;
const SKIP_CHANNELS = new Set(['session:log', 'session:bind']);

type BoundSession = {
  id: string;
  file: string;
  dir: string;
  sourcePath: string;
  startedAt: number;
};

let current: BoundSession | null = null;
let buffer: Omit<SessionEvent, 'session'>[] = [];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function newSessionId(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
    '-',
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds()),
  ].join('');
}

function pruneSessions(logsDir: string): void {
  if (!fs.existsSync(logsDir)) return;
  const files = fs.readdirSync(logsDir)
    .filter((name) => name.startsWith('session-') && name.endsWith('.jsonl'))
    .map((name) => {
      const file = path.join(logsDir, name);
      const stat = fs.statSync(file);
      return { name, file, mtime: stat.mtimeMs };
    })
    .sort((a, b) => a.mtime - b.mtime);

  const extra = files.length - MAX_SESSIONS;
  if (extra <= 0) return;
  for (const item of files.slice(0, extra)) {
    try { fs.unlinkSync(item.file); } catch { /* best-effort */ }
  }
}

function writeLine(file: string, event: SessionEvent): void {
  const line = `${JSON.stringify(event)}\n`;
  fs.appendFileSync(file, line, 'utf-8');
}

export function appendSessionEvent(partial: {
  level?: SessionLevel;
  source: 'renderer' | 'main';
  event: string;
  data?: unknown;
}): void {
  const record: Omit<SessionEvent, 'session'> = {
    ts: new Date().toISOString(),
    level: partial.level ?? 'info',
    source: partial.source,
    event: partial.event,
    data: sanitizeForSessionLog(partial.data),
  };

  if (!current) {
    buffer.push(record);
    if (buffer.length > BUFFER_LIMIT) buffer = buffer.slice(-BUFFER_LIMIT);
    return;
  }

  try {
    writeLine(current.file, { ...record, session: current.id });
  } catch {
    // Logging must never break the app.
  }
}

export function bindSession(payload: {
  projectDir?: string;
  sourcePath?: string;
  name: string;
  media?: unknown;
  settings?: unknown;
}): { sessionId: string; file: string; dir: string } {
  const dir = payload.projectDir
    || (payload.sourcePath ? saveProject(payload.sourcePath, payload.name, {}) : '');
  if (!dir) throw new Error('Invalid project folder');
  const logsDir = path.join(dir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });

  const identity = payload.projectDir || payload.sourcePath || dir;
  if (
    current
    && current.sourcePath === identity
    && Date.now() - current.startedAt < 2000
  ) {
    return { sessionId: current.id, file: current.file, dir: current.dir };
  }

  pruneSessions(logsDir);

  const id = newSessionId();
  const file = path.join(logsDir, `session-${id}.jsonl`);
  current = { id, file, dir, sourcePath: identity, startedAt: Date.now() };

  const pending = buffer;
  buffer = [];

  appendSessionEvent({
    source: 'main',
    event: 'session.start',
    data: {
      sessionId: id,
      file,
      projectDir: dir,
      sourcePath: payload.sourcePath,
      name: payload.name,
      appVersion: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      os: os.release(),
      media: payload.media,
      settings: payload.settings,
    },
  });

  for (const event of pending) {
    try {
      writeLine(file, { ...event, session: id });
    } catch {
      break;
    }
  }

  return { sessionId: id, file, dir };
}

export function installIpcLogging(ipc: IpcMain): void {
  const original = ipc.handle.bind(ipc);
  ipc.handle = ((channel: string, listener: (...args: unknown[]) => unknown) => {
    return original(channel, async (event, ...args: unknown[]) => {
      if (SKIP_CHANNELS.has(channel)) {
        return listener(event, ...args);
      }
      const started = Date.now();
      try {
        const result = await listener(event, ...args);
        appendSessionEvent({
          source: 'main',
          event: `ipc.${channel}`,
          data: {
            args: sanitizeForSessionLog(args),
            result: sanitizeForSessionLog(result),
            ms: Date.now() - started,
          },
        });
        return result;
      } catch (error) {
        appendSessionEvent({
          level: 'error',
          source: 'main',
          event: `ipc.${channel}`,
          data: {
            args: sanitizeForSessionLog(args),
            error: serializeError(error),
            ms: Date.now() - started,
          },
        });
        throw error;
      }
    });
  }) as typeof ipc.handle;

  process.on('uncaughtException', (error) => {
    appendSessionEvent({
      level: 'error',
      source: 'main',
      event: 'process.uncaughtException',
      data: serializeError(error),
    });
  });
  process.on('unhandledRejection', (reason) => {
    appendSessionEvent({
      level: 'error',
      source: 'main',
      event: 'process.unhandledRejection',
      data: serializeError(reason),
    });
  });
}
