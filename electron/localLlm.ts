import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { app, net } from 'electron';
import { fileURLToPath } from 'url';
import { killTrackedChild, trackChild } from './childProcesses';

const ELECTRON_DIR = path.dirname(fileURLToPath(import.meta.url));
const LLM_FILE = 'Qwen2.5-7B-Instruct-Q4_K_M.gguf';
const LLM_PORT = 18742;
const LLM_HOST = '127.0.0.1';

let serverProc: ChildProcess | null = null;
let serverReady = false;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let idleMinutes = 5;
let inFlight = 0;

export function setLlmIdleMinutes(minutes: number): void {
  idleMinutes = Number.isFinite(minutes) ? Math.max(0, Math.min(60, Math.round(minutes))) : 5;
  scheduleIdleUnload();
}

function clearIdleTimer(): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function scheduleIdleUnload(): void {
  clearIdleTimer();
  if (idleMinutes <= 0 || inFlight > 0 || !serverProc) return;
  idleTimer = setTimeout(() => {
    if (inFlight > 0) return;
    console.log(`[Local LLM] Unloading after ${idleMinutes} minute(s) of inactivity`);
    stopLocalLlm();
  }, idleMinutes * 60_000);
}

function firstExisting(paths: string[]): string | null {
  for (const candidate of paths) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function modelsDirCandidates(): string[] {
  return [
    path.join(process.cwd(), 'models'),
    path.join(ELECTRON_DIR, '..', 'models'),
    path.join(app.getAppPath(), 'models'),
    path.join(process.resourcesPath, 'models'),
  ];
}

export function resolveLocalLlmPath(): string | null {
  return firstExisting(modelsDirCandidates().map(dir => path.join(dir, LLM_FILE)));
}

export function resolveLlamaServer(): string | null {
  const bin = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';
  const fromPath = (process.env.PATH ?? '')
    .split(path.delimiter)
    .map(dir => path.join(dir, bin));

  return firstExisting([
    path.join('/opt/homebrew/bin', bin),
    path.join('/usr/local/bin', bin),
    path.join(process.resourcesPath, 'llama', bin),
    path.join(ELECTRON_DIR, '..', 'bin', bin),
    ...fromPath,
  ]);
}

export async function probeLocalLlm(): Promise<{ ok: boolean; error?: string }> {
  const server = resolveLlamaServer();
  if (!server) {
    return {
      ok: false,
      error: 'llama-server not found. Install llama.cpp with: brew install llama.cpp',
    };
  }
  const model = resolveLocalLlmPath();
  if (!model) {
    return {
      ok: false,
      error: `Local translator model not found. Put ${LLM_FILE} in the models/ folder.`,
    };
  }
  return { ok: true };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForHealth(timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await net.fetch(`http://${LLM_HOST}:${LLM_PORT}/health`);
      if (res.ok) return;
    } catch {
      // still booting
    }
    await sleep(400);
  }
  throw new Error('Local translator (llama-server) did not start in time');
}

export function stopLocalLlm(): void {
  clearIdleTimer();
  if (serverProc) {
    killTrackedChild(serverProc);
  }
  serverProc = null;
  serverReady = false;
}

async function ensureLlamaServer(): Promise<void> {
  if (serverReady && serverProc && !serverProc.killed) return;

  const probe = await probeLocalLlm();
  if (!probe.ok) throw new Error(probe.error || 'Local translator is not available');

  const bin = resolveLlamaServer()!;
  const model = resolveLocalLlmPath()!;

  stopLocalLlm();

  serverProc = trackChild(spawn(bin, [
    '-m', model,
    '--host', LLM_HOST,
    '--port', String(LLM_PORT),
    '-ngl', '99',
    '-c', '4096',
  ], {
    env: {
      ...process.env,
      PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ''}`,
    },
  }));

  serverProc.on('exit', () => {
    serverProc = null;
    serverReady = false;
  });

  await waitForHealth(120_000);
  serverReady = true;
}

export async function callLocalText(model: string, prompt: string) {
  inFlight += 1;
  clearIdleTimer();
  try {
    await ensureLlamaServer();

    const res = await net.fetch(`http://${LLM_HOST}:${LLM_PORT}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'local-translator',
        temperature: 0.1,
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const payload = await res.json().catch(() => ({})) as {
      error?: { message?: string };
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    if (!res.ok) {
      throw new Error(payload.error?.message || `Local translator HTTP ${res.status}`);
    }

    return {
      text: payload.choices?.[0]?.message?.content || '',
      tokenUsage: {
        inputTokens: payload.usage?.prompt_tokens || 0,
        outputTokens: payload.usage?.completion_tokens || 0,
        provider: 'local' as const,
        model,
        timestamp: Date.now(),
      },
    };
  } finally {
    inFlight = Math.max(0, inFlight - 1);
    scheduleIdleUnload();
  }
}
