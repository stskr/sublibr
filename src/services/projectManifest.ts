export const MANIFEST_FILENAME = 'project.sublibr';
export const LEGACY_META_FILE = 'project.json';
export const MEDIA_DIR_NAME = 'media';
export const SUBTITLES_FILE = 'subtitles.json';
export const VERSIONS_FILE = 'versions.json';
export const FORMAT_ID = 'sublibr-project';
export const MANIFEST_VERSION = 1;

export interface ProjectMedia {
  /** Path relative to the project folder, posix separators. */
  relativePath: string | null;
  originalName: string | null;
  duration?: number;
  width?: number | null;
  height?: number | null;
  size?: number;
  isVideo?: boolean;
  /** Last-known absolute path; hint for relink on the same machine. */
  sourceHint?: string | null;
}

export interface ProjectManifest {
  format: typeof FORMAT_ID;
  version: number;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  media: ProjectMedia | null;
}

export interface LegacyProjectMeta {
  sourcePath?: string;
  name?: string;
  createdAt?: number;
  updatedAt?: number;
}

export function sanitizeProjectName(name: string): string {
  const stem = name.replace(/\.[^/.]+$/, '');
  const cleaned = stem
    .replace(/[<>:"/\\|?*\u0000-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim();
  return cleaned.slice(0, 80) || 'Untitled Project';
}

export function uniqueName(existing: Iterable<string>, base: string): string {
  const taken = new Set([...existing].map((name) => name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`.toLowerCase())) n += 1;
  return `${base} ${n}`;
}

export function uniqueFileName(existing: Iterable<string>, filename: string): string {
  const taken = new Set([...existing].map((name) => name.toLowerCase()));
  if (!taken.has(filename.toLowerCase())) return filename;
  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : '';
  let n = 2;
  while (taken.has(`${stem} ${n}${ext}`.toLowerCase())) n += 1;
  return `${stem} ${n}${ext}`;
}

/** Store relative paths with `/` so a project folder can move between OSes. */
export function toPosixRelative(relativePath: string): string {
  return relativePath.replace(/\\/g, '/');
}

export function fromPosixRelative(relativePath: string, sep = '/'): string {
  return relativePath.split('/').join(sep);
}

export function isPathInside(child: string, parent: string, sep = '/'): boolean {
  const normalize = (value: string) => {
    const trimmed = value.replace(/[/\\]+$/, '');
    return sep === '\\' ? trimmed.toLowerCase() : trimmed;
  };
  const resolvedChild = normalize(child);
  const resolvedParent = normalize(parent);
  return resolvedChild === resolvedParent
    || resolvedChild.startsWith(resolvedParent + sep);
}

export function buildManifest(partial: {
  id: string;
  name: string;
  createdAt?: number;
  updatedAt?: number;
  media?: ProjectMedia | null;
}): ProjectManifest {
  const now = Date.now();
  return {
    format: FORMAT_ID,
    version: MANIFEST_VERSION,
    id: partial.id,
    name: partial.name,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    media: partial.media ?? null,
  };
}

export function parseManifest(value: unknown): ProjectManifest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.format !== FORMAT_ID) return null;
  if (typeof raw.id !== 'string' || !raw.id) return null;
  if (typeof raw.name !== 'string' || !raw.name) return null;
  const media = parseMedia(raw.media);
  return {
    format: FORMAT_ID,
    version: typeof raw.version === 'number' ? raw.version : MANIFEST_VERSION,
    id: raw.id,
    name: raw.name,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
    media,
  };
}

function parseMedia(value: unknown): ProjectMedia | null {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  return {
    relativePath: typeof raw.relativePath === 'string' ? toPosixRelative(raw.relativePath) : null,
    originalName: typeof raw.originalName === 'string' ? raw.originalName : null,
    duration: typeof raw.duration === 'number' ? raw.duration : undefined,
    width: typeof raw.width === 'number' ? raw.width : null,
    height: typeof raw.height === 'number' ? raw.height : null,
    size: typeof raw.size === 'number' ? raw.size : undefined,
    isVideo: typeof raw.isVideo === 'boolean' ? raw.isVideo : undefined,
    sourceHint: typeof raw.sourceHint === 'string' ? raw.sourceHint : null,
  };
}

export function migrateLegacyMeta(legacy: LegacyProjectMeta, id: string): ProjectManifest {
  const name = sanitizeProjectName(legacy.name || (legacy.sourcePath ? legacy.sourcePath : 'Untitled Project'));
  const originalName = legacy.sourcePath
    ? legacy.sourcePath.replace(/^.*[/\\]/, '')
    : null;
  return buildManifest({
    id,
    name,
    createdAt: legacy.createdAt,
    updatedAt: legacy.updatedAt,
    media: {
      relativePath: null,
      originalName,
      sourceHint: legacy.sourcePath || null,
    },
  });
}

export function isProjectManifestName(filename: string): boolean {
  return filename.toLowerCase() === MANIFEST_FILENAME;
}
