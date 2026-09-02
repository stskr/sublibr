import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { trackChild } from './childProcesses';
import { catalogWeightId } from '../src/services/localModelCatalog';
import { anyWhisperFilePresent, resolveWhisperModelFile } from './importedModels';
import { firstExisting } from './localModelPaths';
import { getWorkDir } from './projects';
import { audioDurationFromWords, makeTokenUsage, resolveTokenUsage } from '../src/services/tokenCount';

const ELECTRON_DIR = path.dirname(fileURLToPath(import.meta.url));

type Word = { start: number; end: number; word: string };

export function resolveLocalModelPath(modelId: string): string | null {
  return resolveWhisperModelFile(modelId);
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
  if (modelId.startsWith('imp_')) {
    return 'Imported Whisper file is missing. Add it again in Settings → Models.';
  }
  if (catalogWeightId(modelId) === 'whisper-hebrew') {
    return 'Hebrew model not found. Download Hebrew Whisper in Settings → Models.';
  }
  return 'Whisper weights not found. Set up offline in Settings → General, or add a file in Models.';
}

export async function probeLocalWhisper(): Promise<{ ok: boolean; error?: string }> {
  const cli = resolveWhisperCli();
  if (!cli) {
    return {
      ok: false,
      error: 'whisper-cli not found. Set up offline in Settings → General.',
    };
  }

  if (!anyWhisperFilePresent()) {
    return {
      ok: false,
      error: 'No local Whisper weights yet. Set up offline in Settings → General.',
    };
  }
  return { ok: true };
}

function whisperLanguage(modelId: string, language?: string | null): string {
  if (language && language !== 'auto') return language;
  return catalogWeightId(modelId) === 'whisper-hebrew' ? 'he' : 'auto';
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
  modelId: string = 'whisper-large-v3-turbo',
) {
  const model = resolveLocalModelPath(modelId);
  const cli = resolveWhisperCli();
  if (!cli) {
    throw new Error('whisper-cli not found. Set up offline in Settings → General.');
  }
  if (!model) {
    throw new Error(missingModelMessage(modelId));
  }

  const outPrefix = path.join(getWorkDir(), `sublibr-whisper-${Date.now()}-${process.pid}`);
  const jsonPath = `${outPrefix}.json`;
  const threads = Math.max(2, os.cpus().length - 1);

  try {
    await runWhisper(cli, [
      '-m', model,
      '-f', audioPath,
      '-l', whisperLanguage(modelId, language),
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
      tokenUsage: makeTokenUsage(
        'local',
        modelId,
        resolveTokenUsage({ transcript: text, durationSec: audioDurationFromWords(words) }),
      ),
    };
  } finally {
    fs.promises.unlink(jsonPath).catch(() => {});
  }
}
