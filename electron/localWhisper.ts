import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { app } from 'electron';
import { fileURLToPath } from 'url';
import { trackChild } from './childProcesses';
import { getWorkDir } from './projects';

const ELECTRON_DIR = path.dirname(fileURLToPath(import.meta.url));

export type LocalWhisperId = 'ivrit-whisper-large-v3-turbo' | 'whisper-large-v3-turbo';

const LOCAL_MODELS: Record<LocalWhisperId, { file: string; defaultLanguage: string }> = {
  'ivrit-whisper-large-v3-turbo': {
    file: 'ggml-large-v3-turbo.bin',
    defaultLanguage: 'he',
  },
  'whisper-large-v3-turbo': {
    file: 'ggml-large-v3-turbo-official.bin',
    defaultLanguage: 'auto',
  },
};

type Word = { start: number; end: number; word: string };

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

export function resolveLocalModelPath(modelId: string): string | null {
  const spec = LOCAL_MODELS[modelId as LocalWhisperId];
  if (!spec) return null;
  return firstExisting(modelsDirCandidates().map(dir => path.join(dir, spec.file)));
}

export function resolveWhisperCli(): string | null {
  const bin = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
  const fromPath = (process.env.PATH ?? '')
    .split(path.delimiter)
    .map(dir => path.join(dir, bin));

  return firstExisting([
    path.join('/opt/homebrew/bin', bin),
    path.join('/usr/local/bin', bin),
    path.join(process.resourcesPath, 'whisper', bin),
    path.join(ELECTRON_DIR, '..', 'bin', bin),
    ...fromPath,
  ]);
}

function missingModelMessage(modelId: string): string {
  const spec = LOCAL_MODELS[modelId as LocalWhisperId];
  if (modelId === 'whisper-large-v3-turbo') {
    return `Multilingual Whisper not found. Put ${spec?.file ?? 'ggml-large-v3-turbo-official.bin'} in the models/ folder (ggml conversion of openai/whisper-large-v3-turbo).`;
  }
  return 'Hebrew model not found. Put ggml-large-v3-turbo.bin in the models/ folder (ivrit.ai).';
}

export async function probeLocalWhisper(): Promise<{ ok: boolean; error?: string }> {
  const cli = resolveWhisperCli();
  if (!cli) {
    return {
      ok: false,
      error: 'whisper-cli not found. Install whisper.cpp with: brew install whisper-cpp',
    };
  }

  const found = Object.keys(LOCAL_MODELS).filter(id => resolveLocalModelPath(id));
  if (found.length === 0) {
    return {
      ok: false,
      error: 'No local Whisper weights in models/. Add ggml-large-v3-turbo.bin (Hebrew) and/or ggml-large-v3-turbo-official.bin (99 languages).',
    };
  }
  return { ok: true };
}

function whisperLanguage(modelId: string, language?: string | null): string {
  if (language && language !== 'auto') return language;
  return LOCAL_MODELS[modelId as LocalWhisperId]?.defaultLanguage ?? 'auto';
}

function parseWhisperJson(payload: unknown): Word[] {
  const root = payload as {
    transcription?: Array<{
      text?: string;
      offsets?: { from?: number; to?: number };
    }>;
  };
  const items = Array.isArray(root.transcription) ? root.transcription : [];
  return items
    .map((item) => ({
      word: String(item.text ?? '').trim(),
      start: Number(item.offsets?.from ?? 0) / 1000,
      end: Number(item.offsets?.to ?? 0) / 1000,
    }))
    .filter((word) => word.word);
}

function runWhisper(cli: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = trackChild(spawn(cli, args, {
      env: {
        ...process.env,
        PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ''}`,
      },
    }));
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const lastLines = stderr.trim().split('\n').slice(-8).join('\n');
      reject(new Error(lastLines || `whisper-cli exited with code ${code}`));
    });
  });
}

export async function transcribeLocal(
  audioPath: string,
  language?: string | null,
  modelId: string = 'ivrit-whisper-large-v3-turbo',
) {
  const resolvedId = LOCAL_MODELS[modelId as LocalWhisperId] ? modelId : 'whisper-large-v3-turbo';
  const model = resolveLocalModelPath(resolvedId);
  const cli = resolveWhisperCli();
  if (!cli) {
    throw new Error('whisper-cli not found. Install whisper.cpp with: brew install whisper-cpp');
  }
  if (!model) {
    throw new Error(missingModelMessage(resolvedId));
  }

  const outPrefix = path.join(getWorkDir(), `sublibr-whisper-${Date.now()}-${process.pid}`);
  const jsonPath = `${outPrefix}.json`;
  const threads = Math.max(2, os.cpus().length - 1);

  try {
    await runWhisper(cli, [
      '-m', model,
      '-f', audioPath,
      '-l', whisperLanguage(resolvedId, language),
      '-ml', '1',
      '-sow',
      '-oj',
      '-of', outPrefix,
      '-t', String(threads),
    ]);

    if (!fs.existsSync(jsonPath)) {
      throw new Error('whisper-cli finished without writing timestamps JSON');
    }

    const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const words = parseWhisperJson(payload);
    const text = words.map((w) => w.word).join(' ');

    if (text.trim() && words.length === 0) {
      throw new Error(
        'Local Whisper returned a transcript with no timestamps. Subtitles need word-level times.',
      );
    }

    return {
      text: JSON.stringify({ text, words }),
      tokenUsage: {
        inputTokens: 0,
        outputTokens: 0,
        provider: 'local' as const,
        model: resolvedId,
        timestamp: Date.now(),
      },
    };
  } finally {
    fs.promises.unlink(jsonPath).catch(() => {});
  }
}
