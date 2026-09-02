import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { fileURLToPath } from 'url';

const ELECTRON_DIR = path.dirname(fileURLToPath(import.meta.url));

export function firstExisting(paths: string[]): string | null {
  for (const candidate of paths) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** Writable folder for in-app downloads. Packaged apps cannot write into the .app bundle. */
export function getWritableModelsDir(): string {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'models');
  }
  return path.join(process.cwd(), 'models');
}

export function getModelsDirCandidates(): string[] {
  const dirs = [
    getWritableModelsDir(),
    path.join(process.cwd(), 'models'),
    path.join(ELECTRON_DIR, '..', 'models'),
    path.join(app.getAppPath(), 'models'),
    path.join(process.resourcesPath, 'models'),
  ];
  return [...new Set(dirs)];
}

export function resolveWeightFile(filename: string): string | null {
  return firstExisting(getModelsDirCandidates().map((dir) => path.join(dir, filename)));
}

export function ensureWritableModelsDir(): string {
  const dir = getWritableModelsDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
