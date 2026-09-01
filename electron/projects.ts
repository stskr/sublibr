import { createHash } from 'crypto';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';

export const PROJECTS_FOLDER_NAME = 'Sublibr';
export const WORK_DIR_NAME = 'Work';
export const LIBRARY_DIR_NAME = 'Library';

export type LibraryKey = 'subtitle-cache' | 'subtitle-versions';

const LIBRARY_KEYS: LibraryKey[] = ['subtitle-cache', 'subtitle-versions'];
const RESERVED_DIRS = new Set([WORK_DIR_NAME, LIBRARY_DIR_NAME]);
const PROJECT_META_FILE = 'project.json';
const SUBTITLES_FILE = 'subtitles.json';
const VERSIONS_FILE = 'versions.json';

export interface ProjectMeta {
  sourcePath: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

let resolvedFolder: string | null = null;

export function defaultProjectsFolder(): string {
  return path.join(app.getPath('documents'), PROJECTS_FOLDER_NAME);
}

export function setProjectsFolderPath(folder: string): string {
  resolvedFolder = path.resolve(folder);
  ensureProjectsLayout(resolvedFolder);
  return resolvedFolder;
}

export function peekProjectsFolder(): string {
  return resolvedFolder ?? defaultProjectsFolder();
}

export function getProjectsFolder(): string {
  if (!resolvedFolder) {
    resolvedFolder = defaultProjectsFolder();
  }
  fs.mkdirSync(resolvedFolder, { recursive: true });
  return resolvedFolder;
}

export function ensureProjectsLayout(folder = getProjectsFolder()): string {
  fs.mkdirSync(folder, { recursive: true });
  fs.mkdirSync(path.join(folder, WORK_DIR_NAME), { recursive: true });
  return folder;
}

export function getWorkDir(): string {
  const dir = path.join(getProjectsFolder(), WORK_DIR_NAME);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getLibraryDir(): string {
  const dir = path.join(getProjectsFolder(), LIBRARY_DIR_NAME);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function libraryFilePath(key: LibraryKey): string {
  return path.join(getLibraryDir(), `${key}.json`);
}

export function isLibraryKey(key: string): key is LibraryKey {
  return LIBRARY_KEYS.includes(key as LibraryKey);
}

export function readLibraryJson(key: LibraryKey): unknown {
  const file = libraryFilePath(key);
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return undefined;
  }
}

export function writeLibraryJson(key: LibraryKey, value: unknown): void {
  fs.writeFileSync(libraryFilePath(key), JSON.stringify(value), 'utf-8');
}

export function deleteLibraryJson(key: LibraryKey): void {
  try {
    fs.unlinkSync(libraryFilePath(key));
  } catch {
    // best-effort
  }
}

function shortHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 8);
}

function sanitizeProjectName(name: string): string {
  const stem = name.replace(/\.[^/.]+$/, '');
  const cleaned = stem
    .replace(/[<>:"/\\|?*\u0000-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim();
  return cleaned.slice(0, 80) || 'Untitled';
}

function readJsonFile<T>(file: string): T | undefined {
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    return undefined;
  }
}

function assertNoSecrets(value: unknown): void {
  const json = JSON.stringify(value);
  if (/"apiKey"\s*:/i.test(json)) {
    throw new Error('Refusing to write API keys to the projects folder');
  }
}

function writeJsonFile(file: string, value: unknown): void {
  assertNoSecrets(value);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf-8');
}

function listProjectDirs(): string[] {
  const root = getProjectsFolder();
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !RESERVED_DIRS.has(entry.name) && !entry.name.startsWith('.'))
    .map((entry) => path.join(root, entry.name));
}

export function findProjectDir(sourcePath: string): string | null {
  const resolved = path.resolve(sourcePath);
  for (const dir of listProjectDirs()) {
    const meta = readJsonFile<ProjectMeta>(path.join(dir, PROJECT_META_FILE));
    if (meta?.sourcePath && path.resolve(meta.sourcePath) === resolved) {
      return dir;
    }
  }
  return null;
}

export function resolveProjectDir(sourcePath: string, displayName: string): string {
  const existing = findProjectDir(sourcePath);
  if (existing) return existing;

  const root = getProjectsFolder();
  const base = sanitizeProjectName(displayName);
  let dir = path.join(root, base);
  if (fs.existsSync(dir)) {
    const meta = readJsonFile<ProjectMeta>(path.join(dir, PROJECT_META_FILE));
    if (meta?.sourcePath && path.resolve(meta.sourcePath) === path.resolve(sourcePath)) {
      return dir;
    }
    dir = path.join(root, `${base} ${shortHash(sourcePath)}`);
  }
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeMeta(dir: string, sourcePath: string, name: string): void {
  const existing = readJsonFile<ProjectMeta>(path.join(dir, PROJECT_META_FILE));
  const meta: ProjectMeta = {
    sourcePath: path.resolve(sourcePath),
    name,
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };
  writeJsonFile(path.join(dir, PROJECT_META_FILE), meta);
}

export function loadProject(sourcePath: string): {
  dir: string;
  subtitles: unknown;
  versions: unknown;
} | null {
  const dir = findProjectDir(sourcePath);
  if (!dir) return null;
  return {
    dir,
    subtitles: readJsonFile(path.join(dir, SUBTITLES_FILE)) ?? [],
    versions: readJsonFile(path.join(dir, VERSIONS_FILE)) ?? [],
  };
}

export function saveProject(
  sourcePath: string,
  name: string,
  data: { subtitles?: unknown; versions?: unknown },
): string {
  const dir = resolveProjectDir(sourcePath, name);
  writeMeta(dir, sourcePath, name);
  if (data.subtitles !== undefined) {
    writeJsonFile(path.join(dir, SUBTITLES_FILE), data.subtitles);
  }
  if (data.versions !== undefined) {
    writeJsonFile(path.join(dir, VERSIONS_FILE), data.versions);
  }
  return dir;
}

export function migrateLibraryIntoProjects(): void {
  const cache = (readLibraryJson('subtitle-cache') ?? {}) as Record<string, unknown>;
  const versions = (readLibraryJson('subtitle-versions') ?? {}) as Record<string, unknown>;
  const mediaPaths = new Set([...Object.keys(cache), ...Object.keys(versions)]);
  for (const mediaPath of mediaPaths) {
    if (!mediaPath) continue;
    saveProject(mediaPath, path.basename(mediaPath), {
      ...(cache[mediaPath] !== undefined ? { subtitles: cache[mediaPath] } : {}),
      ...(versions[mediaPath] !== undefined ? { versions: versions[mediaPath] } : {}),
    });
  }
  if (mediaPaths.size > 0) {
    deleteLibraryJson('subtitle-cache');
    deleteLibraryJson('subtitle-versions');
  }
  try {
    const libraryDir = path.join(getProjectsFolder(), LIBRARY_DIR_NAME);
    if (fs.existsSync(libraryDir) && fs.readdirSync(libraryDir).length === 0) {
      fs.rmdirSync(libraryDir);
    }
  } catch {
    // best-effort
  }
}

export function assembleLibraryMap(key: LibraryKey): Record<string, unknown> {
  migrateLibraryIntoProjects();
  const file = key === 'subtitle-cache' ? SUBTITLES_FILE : VERSIONS_FILE;
  const map: Record<string, unknown> = {};
  for (const dir of listProjectDirs()) {
    const meta = readJsonFile<ProjectMeta>(path.join(dir, PROJECT_META_FILE));
    if (!meta?.sourcePath) continue;
    const data = readJsonFile(path.join(dir, file));
    if (data !== undefined) map[meta.sourcePath] = data;
  }
  return map;
}

export function writeLibraryMap(key: LibraryKey, value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  for (const [mediaPath, data] of Object.entries(value as Record<string, unknown>)) {
    if (!mediaPath) continue;
    saveProject(
      mediaPath,
      path.basename(mediaPath),
      key === 'subtitle-cache' ? { subtitles: data } : { versions: data },
    );
  }
}

export function migrateLibraryTo(newFolder: string): string {
  const oldFolder = resolvedFolder ?? defaultProjectsFolder();
  const resolved = path.resolve(newFolder);
  ensureProjectsLayout(resolved);
  if (path.resolve(oldFolder) === resolved) {
    resolvedFolder = resolved;
    return resolved;
  }

  if (fs.existsSync(oldFolder)) {
    for (const entry of fs.readdirSync(oldFolder, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === WORK_DIR_NAME) continue;
      const src = path.join(oldFolder, entry.name);
      const dest = path.join(resolved, entry.name);
      try {
        if (!fs.existsSync(dest)) {
          fs.cpSync(src, dest, { recursive: true });
        }
      } catch {
        // best-effort
      }
    }
  }

  return setProjectsFolderPath(resolved);
}
