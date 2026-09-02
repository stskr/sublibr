import { createHash, randomUUID } from 'crypto';
import { app, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import {
  FORMAT_ID,
  LEGACY_META_FILE,
  MANIFEST_FILENAME,
  MEDIA_DIR_NAME,
  SUBTITLES_FILE,
  VERSIONS_FILE,
  buildManifest,
  fromPosixRelative,
  isPathInside,
  migrateLegacyMeta,
  parseManifest,
  sanitizeProjectName,
  toPosixRelative,
  uniqueFileName,
  uniqueName,
  type ProjectManifest,
  type ProjectMedia,
} from '../src/services/projectManifest';

export const PROJECTS_FOLDER_NAME = 'Sublibr';
export const WORK_DIR_NAME = 'Work';
export const LIBRARY_DIR_NAME = 'Library';

export type LibraryKey = 'subtitle-cache' | 'subtitle-versions';

const LIBRARY_KEYS: LibraryKey[] = ['subtitle-cache', 'subtitle-versions'];
const RESERVED_DIRS = new Set([WORK_DIR_NAME, LIBRARY_DIR_NAME]);

export interface ProjectSummary {
  dir: string;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  mediaName: string | null;
  subtitleCount: number;
  hasMedia: boolean;
  missingMedia: boolean;
}

export interface LoadedProject {
  dir: string;
  manifest: ProjectManifest;
  subtitles: unknown;
  versions: unknown;
  mediaPath: string | null;
  missingMedia: boolean;
  missingMediaName: string | null;
}

export interface ProjectMediaInfo {
  duration?: number;
  width?: number | null;
  height?: number | null;
  size?: number;
  isVideo?: boolean;
}

interface LegacyProjectMeta {
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
  try { fs.unlinkSync(libraryFilePath(key)); } catch { /* best-effort */ }
}

function shortHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 8);
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

function assertProjectDir(dir: string): string {
  const resolved = path.resolve(dir);
  const root = getProjectsFolder();
  if (!isPathInside(resolved, root, path.sep)) {
    throw new Error('Access denied: not a project folder');
  }
  if (RESERVED_DIRS.has(path.basename(resolved))) {
    throw new Error('Access denied: reserved folder');
  }
  return resolved;
}

function manifestPath(dir: string): string {
  return path.join(dir, MANIFEST_FILENAME);
}

function resolveMediaAbs(dir: string, relativePath: string | null | undefined): string | null {
  if (!relativePath) return null;
  return path.join(dir, fromPosixRelative(relativePath, path.sep));
}

function countSubtitles(dir: string): number {
  const data = readJsonFile<unknown>(path.join(dir, SUBTITLES_FILE));
  return Array.isArray(data) ? data.length : 0;
}

function readOrMigrateManifest(dir: string): ProjectManifest | null {
  const existing = parseManifest(readJsonFile(manifestPath(dir)));
  if (existing) return existing;

  const legacy = readJsonFile<LegacyProjectMeta>(path.join(dir, LEGACY_META_FILE));
  if (!legacy) return null;

  const migrated = migrateLegacyMeta(legacy, randomUUID());
  writeJsonFile(manifestPath(dir), migrated);
  return migrated;
}

function writeManifest(dir: string, manifest: ProjectManifest): void {
  writeJsonFile(manifestPath(dir), {
    ...manifest,
    format: FORMAT_ID,
    updatedAt: Date.now(),
  });
}

function mediaDisplayName(manifest: ProjectManifest): string | null {
  return manifest.media?.originalName
    || (manifest.media?.relativePath ? path.basename(manifest.media.relativePath) : null);
}

function mediaMissing(dir: string, manifest: ProjectManifest): boolean {
  if (!manifest.media?.relativePath && !manifest.media?.sourceHint && !manifest.media?.originalName) {
    return false;
  }
  const collected = resolveMediaAbs(dir, manifest.media?.relativePath);
  if (collected && fs.existsSync(collected)) return false;
  if (manifest.media?.sourceHint && fs.existsSync(manifest.media.sourceHint)) return false;
  return Boolean(manifest.media?.relativePath || manifest.media?.originalName || manifest.media?.sourceHint);
}

export function listProjects(): ProjectSummary[] {
  migrateLibraryIntoProjects();
  const summaries: ProjectSummary[] = [];
  for (const dir of listProjectDirs()) {
    const manifest = readOrMigrateManifest(dir);
    if (!manifest) continue;
    const collected = resolveMediaAbs(dir, manifest.media?.relativePath);
    const hasCollected = Boolean(collected && fs.existsSync(collected));
    summaries.push({
      dir,
      id: manifest.id,
      name: manifest.name,
      createdAt: manifest.createdAt,
      updatedAt: manifest.updatedAt,
      mediaName: mediaDisplayName(manifest),
      subtitleCount: countSubtitles(dir),
      hasMedia: hasCollected,
      missingMedia: mediaMissing(dir, manifest),
    });
  }
  return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
}

function siblingFolderNames(exceptDir?: string): string[] {
  const root = getProjectsFolder();
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !RESERVED_DIRS.has(entry.name))
    .filter((entry) => path.join(root, entry.name) !== exceptDir)
    .map((entry) => entry.name);
}

function allocateProjectDir(displayName: string): string {
  const root = getProjectsFolder();
  ensureProjectsLayout(root);
  const folderName = uniqueName(siblingFolderNames(), sanitizeProjectName(displayName));
  const dir = path.join(root, folderName);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, MEDIA_DIR_NAME), { recursive: true });
  return dir;
}

export function createProject(name = 'Untitled Project'): LoadedProject {
  const dir = allocateProjectDir(name);
  const manifest = buildManifest({ id: randomUUID(), name: sanitizeProjectName(name) });
  writeManifest(dir, manifest);
  return {
    dir,
    manifest,
    subtitles: [],
    versions: [],
    mediaPath: null,
    missingMedia: false,
    missingMediaName: null,
  };
}

async function collectFile(projectDir: string, sourcePath: string): Promise<{ relativePath: string; dest: string }> {
  const resolved = path.resolve(sourcePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Media file not found: ${path.basename(resolved)}`);
  }

  const mediaDir = path.join(projectDir, MEDIA_DIR_NAME);
  fs.mkdirSync(mediaDir, { recursive: true });

  if (isPathInside(resolved, projectDir, path.sep)) {
    return {
      relativePath: toPosixRelative(path.relative(projectDir, resolved)),
      dest: resolved,
    };
  }

  const existing = fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir) : [];
  const destName = uniqueFileName(existing, path.basename(resolved));
  const dest = path.join(mediaDir, destName);
  await fs.promises.copyFile(resolved, dest);
  return {
    relativePath: toPosixRelative(path.join(MEDIA_DIR_NAME, destName)),
    dest,
  };
}

function toLoaded(dir: string, manifest: ProjectManifest): LoadedProject {
  const collected = resolveMediaAbs(dir, manifest.media?.relativePath);
  const hint = manifest.media?.sourceHint ? path.resolve(manifest.media.sourceHint) : null;
  const mediaPath = (collected && fs.existsSync(collected))
    ? collected
    : (hint && fs.existsSync(hint) ? hint : null);
  const missing = !mediaPath && Boolean(
    manifest.media?.relativePath || manifest.media?.originalName || manifest.media?.sourceHint,
  );
  return {
    dir,
    manifest,
    subtitles: readJsonFile(path.join(dir, SUBTITLES_FILE)) ?? [],
    versions: readJsonFile(path.join(dir, VERSIONS_FILE)) ?? [],
    mediaPath,
    missingMedia: missing,
    missingMediaName: mediaDisplayName(manifest),
  };
}

export async function collectMedia(
  projectDir: string,
  sourcePath: string,
  info?: ProjectMediaInfo,
): Promise<LoadedProject> {
  const dir = assertProjectDir(projectDir);
  const manifest = readOrMigrateManifest(dir) ?? buildManifest({
    id: randomUUID(),
    name: sanitizeProjectName(path.basename(dir)),
  });
  const previous = resolveMediaAbs(dir, manifest.media?.relativePath);
  const { relativePath, dest } = await collectFile(dir, sourcePath);
  const stats = fs.statSync(dest);
  const media: ProjectMedia = {
    relativePath,
    originalName: path.basename(sourcePath),
    duration: info?.duration,
    width: info?.width,
    height: info?.height,
    size: info?.size ?? stats.size,
    isVideo: info?.isVideo,
    sourceHint: path.resolve(sourcePath),
  };
  const next: ProjectManifest = {
    ...manifest,
    media,
    name: manifest.name || sanitizeProjectName(media.originalName || path.basename(dir)),
  };
  writeManifest(dir, next);

  if (
    previous
    && previous !== dest
    && isPathInside(previous, path.join(dir, MEDIA_DIR_NAME), path.sep)
    && fs.existsSync(previous)
  ) {
    try { fs.unlinkSync(previous); } catch { /* keep old file if delete fails */ }
  }

  return toLoaded(dir, { ...next, updatedAt: Date.now() });
}

export async function createProjectFromMedia(
  sourcePath: string,
  info?: ProjectMediaInfo & { name?: string },
): Promise<LoadedProject> {
  const existing = findProjectByMediaPath(sourcePath);
  if (existing) {
    if (existing.manifest.media?.relativePath) {
      const collected = resolveMediaAbs(existing.dir, existing.manifest.media.relativePath);
      if (collected && fs.existsSync(collected)) return existing;
    }
    return collectMedia(existing.dir, sourcePath, info);
  }

  const display = info?.name || path.basename(sourcePath);
  const created = createProject(display);
  return collectMedia(created.dir, sourcePath, info);
}

export function findProjectByMediaPath(sourcePath: string): LoadedProject | null {
  const resolved = path.resolve(sourcePath);
  for (const dir of listProjectDirs()) {
    const manifest = readOrMigrateManifest(dir);
    if (!manifest) continue;
    const collected = resolveMediaAbs(dir, manifest.media?.relativePath);
    if (collected && path.resolve(collected) === resolved) return toLoaded(dir, manifest);
    if (manifest.media?.sourceHint && path.resolve(manifest.media.sourceHint) === resolved) {
      return toLoaded(dir, manifest);
    }
  }
  return null;
}

export function resolveProjectRef(ref: string): string | null {
  const resolved = path.resolve(ref);
  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    if (readOrMigrateManifest(resolved)) return resolved;
    return null;
  }
  if (fs.existsSync(resolved) && path.basename(resolved).toLowerCase() === MANIFEST_FILENAME) {
    return path.dirname(resolved);
  }
  return findProjectDir(resolved);
}

export function openProject(ref: string): LoadedProject | null {
  const dir = resolveProjectRef(ref);
  if (!dir) return null;
  const manifest = readOrMigrateManifest(dir);
  if (!manifest) return null;
  return toLoaded(dir, manifest);
}

export async function openProjectAndCollect(ref: string): Promise<LoadedProject | null> {
  const loaded = openProject(ref);
  if (!loaded) return null;
  if (loaded.mediaPath && loaded.manifest.media?.relativePath) {
    const collected = resolveMediaAbs(loaded.dir, loaded.manifest.media.relativePath);
    if (collected && fs.existsSync(collected)) return loaded;
  }
  if (loaded.mediaPath && loaded.manifest.media?.sourceHint) {
    try {
      return await collectMedia(loaded.dir, loaded.mediaPath, {
        duration: loaded.manifest.media?.duration,
        width: loaded.manifest.media?.width,
        height: loaded.manifest.media?.height,
        size: loaded.manifest.media?.size,
        isVideo: loaded.manifest.media?.isVideo,
      });
    } catch {
      return loaded;
    }
  }
  return loaded;
}

export function saveProjectData(
  projectDir: string,
  data: { name?: string; subtitles?: unknown; versions?: unknown; media?: ProjectMedia | null },
): string {
  const dir = assertProjectDir(projectDir);
  const current = readOrMigrateManifest(dir) ?? buildManifest({
    id: randomUUID(),
    name: sanitizeProjectName(path.basename(dir)),
  });
  const next: ProjectManifest = {
    ...current,
    name: data.name?.trim() || current.name,
    media: data.media !== undefined ? data.media : current.media,
  };
  writeManifest(dir, next);
  if (data.subtitles !== undefined) {
    writeJsonFile(path.join(dir, SUBTITLES_FILE), data.subtitles);
  }
  if (data.versions !== undefined) {
    writeJsonFile(path.join(dir, VERSIONS_FILE), data.versions);
  }
  return dir;
}

export async function deleteProject(projectDir: string): Promise<void> {
  const dir = assertProjectDir(projectDir);
  if (!readOrMigrateManifest(dir)) {
    throw new Error('Not a Sublibr project');
  }
  try {
    await shell.trashItem(dir);
  } catch {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export async function duplicateProject(projectDir: string): Promise<LoadedProject> {
  const dir = assertProjectDir(projectDir);
  const manifest = readOrMigrateManifest(dir);
  if (!manifest) throw new Error('Not a Sublibr project');

  const copyName = uniqueName(siblingFolderNames(), `${sanitizeProjectName(manifest.name)} copy`);
  const dest = path.join(getProjectsFolder(), copyName);
  fs.cpSync(dir, dest, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(dir, src);
      return rel.split(path.sep)[0] !== 'logs';
    },
  });

  const next = buildManifest({
    id: randomUUID(),
    name: copyName,
    createdAt: Date.now(),
    media: manifest.media,
  });
  writeManifest(dest, next);
  return toLoaded(dest, next);
}

export function renameProject(
  projectDir: string,
  newName: string,
  options: { renameFolder?: boolean } = {},
): LoadedProject {
  const dir = assertProjectDir(projectDir);
  const manifest = readOrMigrateManifest(dir);
  if (!manifest) throw new Error('Not a Sublibr project');

  const cleaned = sanitizeProjectName(newName);
  const next = { ...manifest, name: cleaned };
  writeManifest(dir, next);

  if (!options.renameFolder) {
    return toLoaded(dir, { ...next, updatedAt: Date.now() });
  }

  const destName = uniqueName(siblingFolderNames(dir), cleaned);
  const dest = path.join(getProjectsFolder(), destName);
  if (path.resolve(dest) === dir) {
    return toLoaded(dir, { ...next, updatedAt: Date.now() });
  }
  fs.renameSync(dir, dest);
  return toLoaded(dest, { ...next, updatedAt: Date.now() });
}

export function findProjectDir(sourcePath: string): string | null {
  const resolved = path.resolve(sourcePath);
  for (const dir of listProjectDirs()) {
    const manifest = readOrMigrateManifest(dir);
    if (!manifest) continue;
    const collected = resolveMediaAbs(dir, manifest.media?.relativePath);
    if (collected && path.resolve(collected) === resolved) return dir;
    if (manifest.media?.sourceHint && path.resolve(manifest.media.sourceHint) === resolved) return dir;
    const legacy = readJsonFile<LegacyProjectMeta>(path.join(dir, LEGACY_META_FILE));
    if (legacy?.sourcePath && path.resolve(legacy.sourcePath) === resolved) return dir;
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
    const manifest = readOrMigrateManifest(dir);
    const collected = resolveMediaAbs(dir, manifest?.media?.relativePath ?? null);
    if (collected && path.resolve(collected) === path.resolve(sourcePath)) return dir;
    if (manifest?.media?.sourceHint && path.resolve(manifest.media.sourceHint) === path.resolve(sourcePath)) {
      return dir;
    }
    dir = path.join(root, `${base} ${shortHash(sourcePath)}`);
  }
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function loadProject(sourcePath: string): {
  dir: string;
  subtitles: unknown;
  versions: unknown;
} | null {
  const byRef = openProject(sourcePath);
  if (byRef) {
    return { dir: byRef.dir, subtitles: byRef.subtitles, versions: byRef.versions };
  }
  const found = findProjectDir(sourcePath);
  if (!found) return null;
  const opened = openProject(found);
  if (!opened) return null;
  return { dir: opened.dir, subtitles: opened.subtitles, versions: opened.versions };
}

export function saveProject(
  sourcePath: string,
  name: string,
  data: { subtitles?: unknown; versions?: unknown },
): string {
  const existing = findProjectDir(sourcePath);
  const dir = existing ?? resolveProjectDir(sourcePath, name);
  const current = readOrMigrateManifest(dir);
  if (!current) {
    writeManifest(dir, buildManifest({
      id: randomUUID(),
      name,
      media: {
        relativePath: null,
        originalName: path.basename(sourcePath),
        sourceHint: path.resolve(sourcePath),
      },
    }));
  } else if (!current.media?.relativePath) {
    writeManifest(dir, {
      ...current,
      name: current.name || name,
      media: {
        relativePath: current.media?.relativePath ?? null,
        originalName: current.media?.originalName || path.basename(sourcePath),
        sourceHint: path.resolve(sourcePath),
        duration: current.media?.duration,
        width: current.media?.width,
        height: current.media?.height,
        size: current.media?.size,
        isVideo: current.media?.isVideo,
      },
    });
  }
  return saveProjectData(dir, { name, ...data });
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
    const manifest = readOrMigrateManifest(dir);
    const keyPath = resolveMediaAbs(dir, manifest?.media?.relativePath ?? null)
      || manifest?.media?.sourceHint;
    if (!keyPath) continue;
    const data = readJsonFile(path.join(dir, file));
    if (data !== undefined) map[keyPath] = data;
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
