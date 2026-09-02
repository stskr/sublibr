import { describe, expect, it } from 'vitest';
import {
  FORMAT_ID,
  buildManifest,
  fromPosixRelative,
  isPathInside,
  migrateLegacyMeta,
  parseManifest,
  sanitizeProjectName,
  toPosixRelative,
  uniqueFileName,
  uniqueName,
} from '../src/services/projectManifest';

describe('project manifest helpers', () => {
  it('sanitizes folder names', () => {
    expect(sanitizeProjectName('Tears of Steel.mp4')).toBe('Tears of Steel');
    expect(sanitizeProjectName('a/b:c*.mov')).toBe('a b c');
    expect(sanitizeProjectName('...')).toBe('Untitled Project');
  });

  it('makes unique folder and file names', () => {
    expect(uniqueName(['Untitled Project'], 'Untitled Project')).toBe('Untitled Project 2');
    expect(uniqueName(['Untitled Project', 'Untitled Project 2'], 'Untitled Project')).toBe('Untitled Project 3');
    expect(uniqueFileName(['clip.mp4', 'clip 2.mp4'], 'clip.mp4')).toBe('clip 3.mp4');
  });

  it('stores portable relative paths', () => {
    expect(toPosixRelative('media\\clip.mp4')).toBe('media/clip.mp4');
    expect(fromPosixRelative('media/clip.mp4', '\\')).toBe('media\\clip.mp4');
  });

  it('detects files inside the project folder', () => {
    expect(isPathInside('/Projects/Film/media/a.mp4', '/Projects/Film', '/')).toBe(true);
    expect(isPathInside('/Projects/Film', '/Projects/Film', '/')).toBe(true);
    expect(isPathInside('/Projects/Other/a.mp4', '/Projects/Film', '/')).toBe(false);
  });

  it('parses a valid manifest and rejects junk', () => {
    const built = buildManifest({ id: 'abc', name: 'Film' });
    expect(built.format).toBe(FORMAT_ID);
    expect(parseManifest(built)?.name).toBe('Film');
    expect(parseManifest({ name: 'Film' })).toBeNull();
  });

  it('migrates legacy project.json into a collect-ready manifest', () => {
    const migrated = migrateLegacyMeta({
      sourcePath: '/Users/me/Movies/clip.mp4',
      name: 'clip.mp4',
      createdAt: 10,
      updatedAt: 20,
    }, 'id-1');
    expect(migrated.media?.relativePath).toBeNull();
    expect(migrated.media?.originalName).toBe('clip.mp4');
    expect(migrated.media?.sourceHint).toBe('/Users/me/Movies/clip.mp4');
    expect(migrated.name).toBe('clip');
  });
});
