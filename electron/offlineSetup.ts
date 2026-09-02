import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import { trackChild, killTrackedChild } from './childProcesses';
import { firstExisting } from './localModelPaths';
import { resolveWhisperCli } from './localWhisper';
import { resolveLlamaServer } from './localLlm';
import { catalogFilePresent } from './importedModels';
import { cancelModelDownload, downloadModelWeight } from './modelDownload';
import { OFFLINE_DEPS, brewFormulaAllowlist, type OfflineDepId } from '../src/services/offlineSetup';
import { LOCAL_WEIGHTS, formatWeightSize } from '../src/services/localModelCatalog';

export type OfflineSetupItem = {
  id: OfflineDepId;
  label: string;
  why: string;
  present: boolean;
  install: 'none' | 'brew' | 'download';
  formula?: string;
  detail: string;
  bytes?: number;
  neededFor: 'transcribe' | 'translate';
};

export type OfflineSetupStatus = {
  brew: { present: boolean; path: string | null };
  items: OfflineSetupItem[];
};

export type OfflineSetupProgress = {
  id: OfflineDepId | 'setup';
  status: 'waiting' | 'installing' | 'downloading' | 'ready' | 'error' | 'cancelled';
  percent?: number;
  detail?: string;
  error?: string;
};

const BREW_FORMULAS = new Set(brewFormulaAllowlist());

let brewProc: ChildProcess | null = null;
let cancelled = false;
let installing = false;
const listeners = new Set<(progress: OfflineSetupProgress) => void>();

export function onOfflineSetupProgress(listener: (progress: OfflineSetupProgress) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function emit(progress: OfflineSetupProgress): void {
  for (const listener of listeners) listener(progress);
}

export function resolveBrew(): string | null {
  const bin = process.platform === 'win32' ? 'brew.exe' : 'brew';
  const fromPath = (process.env.PATH ?? '')
    .split(path.delimiter)
    .map((dir) => path.join(dir, bin));
  return firstExisting([
    path.join('/opt/homebrew/bin', bin),
    path.join('/usr/local/bin', bin),
    path.join('/home/linuxbrew/.linuxbrew/bin', bin),
    ...fromPath,
  ]);
}

function brewEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: `/opt/homebrew/bin:/usr/local/bin:/home/linuxbrew/.linuxbrew/bin:${process.env.PATH ?? ''}`,
    HOMEBREW_NO_AUTO_UPDATE: '1',
    HOMEBREW_NO_ANALYTICS: '1',
    NONINTERACTIVE: '1',
  };
}

export function getOfflineSetupStatus(): OfflineSetupStatus {
  const brewPath = resolveBrew();
  const whisper = Boolean(resolveWhisperCli());
  const llama = Boolean(resolveLlamaServer());
  const turbo = catalogFilePresent('whisper-multilingual');
  const qwen = catalogFilePresent('qwen-translator');
  const presentById: Record<OfflineDepId, boolean> = {
    'whisper-cli': whisper,
    'llama-server': llama,
    'whisper-multilingual': turbo,
    'qwen-translator': qwen,
  };

  return {
    brew: { present: Boolean(brewPath), path: brewPath },
    items: OFFLINE_DEPS.map((dep) => {
      const present = presentById[dep.id];
      if (dep.kind === 'runtime') {
        return {
          id: dep.id,
          label: dep.label,
          why: dep.why,
          present,
          install: present ? 'none' : 'brew',
          formula: dep.formula,
          neededFor: dep.neededFor,
          detail: present
            ? 'Already on this computer'
            : `Homebrew package ${dep.formula}`,
        };
      }
      const spec = LOCAL_WEIGHTS[dep.weightId!];
      return {
        id: dep.id,
        label: dep.label,
        why: dep.why,
        present,
        install: present ? 'none' : 'download',
        neededFor: dep.neededFor,
        bytes: spec.bytes,
        detail: present
          ? `Already on this computer · ${formatWeightSize(spec.bytes)}`
          : `${formatWeightSize(spec.bytes)} from Hugging Face`,
      };
    }),
  };
}

export function cancelOfflineSetup(): void {
  cancelled = true;
  if (brewProc) killTrackedChild(brewProc);
  cancelModelDownload('whisper-multilingual');
  cancelModelDownload('qwen-translator');
}

function brewInstall(formula: string): Promise<void> {
  if (!BREW_FORMULAS.has(formula)) {
    return Promise.reject(new Error(`Unknown Homebrew package: ${formula}`));
  }
  const brew = resolveBrew();
  if (!brew) {
    return Promise.reject(new Error('Homebrew is not installed. Install it from https://brew.sh then try again.'));
  }

  return new Promise((resolve, reject) => {
    brewProc = trackChild(spawn(brew, ['install', formula], { env: brewEnv() }));
    let stderr = '';
    brewProc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      const last = text.trim().split('\n').filter(Boolean).pop();
      if (last) emit({ id: 'setup', status: 'installing', detail: last });
    });
    brewProc.on('error', (err) => {
      brewProc = null;
      reject(err);
    });
    brewProc.on('close', (code) => {
      brewProc = null;
      if (cancelled) {
        reject(Object.assign(new Error('Cancelled'), { name: 'AbortError' }));
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      const lastLines = stderr.trim().split('\n').slice(-6).join('\n');
      reject(new Error(lastLines || `brew install ${formula} exited with code ${code}`));
    });
  });
}

export async function installMissingOfflineDeps(ids: OfflineDepId[]): Promise<OfflineSetupStatus> {
  if (installing) throw new Error('Offline setup is already running.');
  const allowed = new Set(OFFLINE_DEPS.map((dep) => dep.id));
  const wanted = [...new Set(ids)].filter((id) => allowed.has(id));
  if (wanted.length === 0) throw new Error('Nothing to install.');

  installing = true;
  cancelled = false;
  try {
    const start = getOfflineSetupStatus();
    const needsBrew = start.items.some((item) => wanted.includes(item.id) && !item.present && item.install === 'brew');
    if (needsBrew && !start.brew.present) {
      throw new Error('Homebrew is not installed. Install it from https://brew.sh, then try again. Sublibr will not install Homebrew itself.');
    }

    for (const item of start.items) {
      if (!wanted.includes(item.id)) continue;
      if (item.present) {
        emit({ id: item.id, status: 'ready', detail: item.detail });
        continue;
      }
      if (cancelled) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });

      if (item.install === 'brew' && item.formula) {
        emit({ id: item.id, status: 'installing', detail: `Installing ${item.formula} with Homebrew…` });
        await brewInstall(item.formula);
        const after = getOfflineSetupStatus().items.find((row) => row.id === item.id);
        if (!after?.present) {
          throw new Error(`${item.label} is still missing after brew install ${item.formula}.`);
        }
        emit({ id: item.id, status: 'ready', detail: 'Already on this computer' });
        continue;
      }

      if (item.install === 'download') {
        const weightId = item.id === 'qwen-translator' ? 'qwen-translator' : 'whisper-multilingual';
        emit({ id: item.id, status: 'downloading', percent: 0, detail: 'Starting download…' });
        await downloadModelWeight(weightId, (progress) => {
          emit({
            id: item.id,
            status: progress.status === 'downloading' ? 'downloading' : progress.status === 'done' ? 'ready' : progress.status,
            percent: progress.percent,
            error: progress.error,
            detail: progress.status === 'downloading' ? `${progress.percent}%` : progress.error,
          });
        });
      }
    }
    return getOfflineSetupStatus();
  } finally {
    installing = false;
    brewProc = null;
  }
}
