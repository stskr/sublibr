import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import { net } from 'electron';
import { fileURLToPath } from 'url';
import { killTrackedChild, trackChild } from './childProcesses';
import { firstExisting } from './localModelPaths';
import { anyLlamaFilePresent, resolveLlamaModelFile } from './importedModels';
import { makeTokenUsage, resolveTokenUsage } from '../src/services/tokenCount';

const ELECTRON_DIR = path.dirname(fileURLToPath(import.meta.url));
const LLM_PORT = 18742;
const LLM_HOST = '127.0.0.1';

let serverProc: ChildProcess | null = null;
let serverReady = false;
let startPromise: Promise<void> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let idleMinutes = 5;
let inFlight = 0;
let loadedLlmPath: string | null = null;

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

export function resolveLocalLlmPath(modelId?: string): string | null {
  if (modelId) return resolveLlamaModelFile(modelId);
  return resolveLlamaModelFile('qwen2.5-7b-instruct')
    ?? resolveLlamaModelFile('qwen-translator-3b');
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
      error: 'llama-server not found. Set up offline in Settings → General.',
    };
  }
  if (!anyLlamaFilePresent()) {
    return {
      ok: false,
      error: 'Local translator model not found. Set up offline in Settings → General, or add a GGUF in Models.',
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
    if (!serverProc) {
      const err = new Error('Local translator was stopped');
      err.name = 'AbortError';
      throw err;
    }
    try {
      const res = await net.fetch(`http://${LLM_HOST}:${LLM_PORT}/health`);
      // 503 = still loading weights
      if (res.ok) return;
    } catch {
      // still booting
    }
    await sleep(500);
  }
  throw new Error('Local translator (llama-server) did not start in time. Try Translate again — the model may still be loading.');
}

export function stopLocalLlm(): void {
  clearIdleTimer();
  startPromise = null;
  if (serverProc) {
    killTrackedChild(serverProc);
  }
  serverProc = null;
  serverReady = false;
  loadedLlmPath = null;
}

async function ensureLlamaServer(modelId: string): Promise<void> {
  const model = resolveLocalLlmPath(modelId);
  if (!model) {
    throw new Error(
      modelId.startsWith('imp_')
        ? 'Imported translator GGUF is missing. Add it again in Settings → Models.'
        : 'Local translator model not found. Set up offline in Settings → General, or add a GGUF in Models.',
    );
  }

  if (serverReady && serverProc && !serverProc.killed && loadedLlmPath === model) return;
  if (loadedLlmPath && loadedLlmPath !== model) {
    stopLocalLlm();
  }
  if (startPromise) return startPromise;

  startPromise = (async () => {
    if (serverReady && serverProc && !serverProc.killed && loadedLlmPath === model) return;

    if (loadedLlmPath === model) {
      try {
        const existing = await net.fetch(`http://${LLM_HOST}:${LLM_PORT}/health`);
        if (existing.ok) {
          serverReady = true;
          return;
        }
      } catch {
        // nothing listening yet
      }
    }

    const probe = await probeLocalLlm();
    if (!probe.ok) throw new Error(probe.error || 'Local translator is not available');

    if (serverProc && !serverProc.killed && loadedLlmPath === model) {
      await waitForHealth(180_000);
      serverReady = true;
      return;
    }

    const bin = resolveLlamaServer()!;
    const modelPath = resolveLocalLlmPath(modelId);
    if (!modelPath) {
      throw new Error('Local translator model not found. Set up offline in Settings → General, or add a GGUF in Models.');
    }

    serverProc = trackChild(spawn(bin, [
      '-m', modelPath,
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

    serverProc.stderr?.on('data', (buf: Buffer) => {
      const line = buf.toString().trim();
      if (line) console.log(`[Local LLM] ${line}`);
    });

    serverProc.on('exit', () => {
      serverProc = null;
      serverReady = false;
      loadedLlmPath = null;
    });

    await waitForHealth(180_000);
    serverReady = true;
    loadedLlmPath = modelPath;
  })().finally(() => {
    startPromise = null;
  });

  return startPromise;
}

export async function callLocalText(model: string, prompt: string) {
  inFlight += 1;
  clearIdleTimer();
  try {
    await ensureLlamaServer(model);

    const res = await net.fetch(`http://${LLM_HOST}:${LLM_PORT}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'local-translator',
        temperature: 0.1,
        max_tokens: 1536,
        messages: [
          {
            role: 'system',
            content: 'You translate subtitles. Reply with numbered lines only, like [1] translated text.',
          },
          { role: 'user', content: prompt },
        ],
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

    const text = payload.choices?.[0]?.message?.content || '';
    return {
      text,
      tokenUsage: makeTokenUsage(
        'local',
        model,
        resolveTokenUsage({ payload, prompt, responseText: text }),
      ),
    };
  } finally {
    inFlight = Math.max(0, inFlight - 1);
    scheduleIdleUnload();
  }
}
