import { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, protocol } from 'electron';
import http from 'http';


import path from 'path';
import fs from 'fs';
// Removed stream import
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import ffmpeg from 'fluent-ffmpeg';
import { createRequire } from 'module';
import { callGeminiAudio, callGeminiText, callOpenAiAudio, callOpenAiText } from './ai';
import { mainFetch } from './httpFetch';
import { probeLocalWhisper, transcribeLocal } from './localWhisper';
import { callLocalText, probeLocalLlm, setLlmIdleMinutes, stopLocalLlm } from './localLlm';
import { killAllChildren, killFfmpegJobs, trackFfmpeg } from './childProcesses';
import {
  assembleLibraryMap,
  collectMedia,
  createProject,
  createProjectFromMedia,
  defaultProjectsFolder,
  deleteProject,
  duplicateProject,
  renameProject,
  getProjectsFolder,
  getWorkDir,
  isLibraryKey,
  listProjects,
  loadProject,
  migrateLibraryIntoProjects,
  migrateLibraryTo,
  openProjectAndCollect,
  peekProjectsFolder,
  readLibraryJson,
  saveProject,
  saveProjectData,
  setProjectsFolderPath,
  writeLibraryJson,
  writeLibraryMap,
} from './projects';
import { bindSession, installIpcLogging, appendSessionEvent } from './sessionLog';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============== Security: Path Validation ==============

// Register custom protocol privileges
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true
    }
  }
]);

// Track file paths the user explicitly selected via native dialogs
const allowedPaths = new Set<string>();

function validatePath(filePath: string, ...allowedDirs: string[]): string {
  if (typeof filePath !== 'string') throw new Error('Invalid path: must be a string');

  const resolved = path.resolve(filePath);

  // Allow paths the user explicitly chose via a native dialog
  if (allowedPaths.has(resolved)) return resolved;

  // Allow paths inside permitted directories (temp, userData, etc.)
  for (const dir of allowedDirs) {
    const resolvedDir = path.resolve(dir);
    if (resolved === resolvedDir || resolved.startsWith(resolvedDir + path.sep)) {
      return resolved;
    }
  }

  throw new Error(`Access denied: path is outside allowed directories`);
}

// Directories that IPC handlers are allowed to access
function getAllowedDirs(): string[] {
  return [
    peekProjectsFolder(),
    app.getPath('userData'),
    app.getPath('temp'),
  ];
}

// ============== Security: Store Key Allowlist ==============

const ALLOWED_STORE_KEYS = ['settings', 'recent-files', 'subtitle-cache', 'subtitle-versions'];

// Set ffmpeg and ffprobe paths
// In packaged builds, binaries live in extraResources; in dev, use npm installer packages
if (app.isPackaged) {
  const ext = process.platform === 'win32' ? '.exe' : '';
  ffmpeg.setFfmpegPath(path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg' + ext));
  ffmpeg.setFfprobePath(path.join(process.resourcesPath, 'ffprobe', 'ffprobe' + ext));
} else {
  // Dynamic require so vite doesn't bundle the platform-specific binaries
  const _require = createRequire(import.meta.url);
  ffmpeg.setFfmpegPath(_require('@ffmpeg-installer/ffmpeg').path);
  ffmpeg.setFfprobePath(_require('@ffprobe-installer/ffprobe').path);
}

// Initialize store for settings
const store = new Store();

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#081420',
  });

  // Open external links in the system default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const appUrl = process.env.VITE_DEV_SERVER_URL || 'file://';
    if (!url.startsWith(appUrl)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.wma': 'audio/x-ms-wma',
    '.alac': 'audio/alac',
    '.aiff': 'audio/x-aiff',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.ts': 'video/mp2t',
    '.mts': 'video/mp2t',
    '.m2ts': 'video/mp2t',
  };
  return map[ext.toLowerCase()] || '';
}

// Media Server Logic
let mediaServer: http.Server | null = null;
let mediaServerPort = 0;

const MEDIA_SERVER_PORT = 18741;

function startMediaServer(): Promise<void> {
  if (mediaServer && mediaServerPort) return Promise.resolve();

  if (mediaServer && !mediaServerPort) {
    return new Promise((resolve) => {
      mediaServer?.once('listening', () => {
        const address = mediaServer?.address();
        if (address && typeof address !== 'string') mediaServerPort = address.port;
        resolve();
      });
    });
  }

  return new Promise((resolve, reject) => {
    mediaServer = http.createServer(async (req, res) => {
    try {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Range');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      const url = new URL(req.url || '', `http://127.0.0.1:${mediaServerPort || MEDIA_SERVER_PORT}`);
      if (url.pathname !== '/stream') {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }

      const fileParam = url.searchParams.get('file');
      if (!fileParam) {
        res.writeHead(400);
        res.end('Missing file parameter');
        return;
      }

      const decodedPath = decodeURIComponent(fileParam);
      const safePath = validatePath(decodedPath, ...getAllowedDirs());

      const stat = await fs.promises.stat(safePath);
      const fileSize = stat.size;
      const range = req.headers.range;
      const mimeType = getMimeType(path.extname(safePath));

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(safePath, { start, end });

        const head = {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': mimeType,
        };

        res.writeHead(206, head);
        file.pipe(res);
      } else {
        const head = {
          'Content-Length': fileSize,
          'Content-Type': mimeType,
        };
        res.writeHead(200, head);
        fs.createReadStream(safePath).pipe(res);
      }
    } catch (error) {
      console.error('Media server error:', error);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    }
  });

  const onListen = () => {
    const address = mediaServer?.address();
    if (address && typeof address !== 'string') {
      mediaServerPort = address.port;
      console.log(`Media server listening on port ${mediaServerPort}`);
    }
    resolve();
  };

  mediaServer.once('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      mediaServer?.listen(0, '127.0.0.1', onListen);
      return;
    }
    reject(err);
  });
  mediaServer.listen(MEDIA_SERVER_PORT, '127.0.0.1', onListen);
  });
}

function stopMediaServer() {
  if (!mediaServer) return;
  mediaServer.close();
  mediaServer = null;
  mediaServerPort = 0;
}

function applyIdleMinutesFromSettings(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  const minutes = (value as { unloadAfterMinutes?: unknown }).unloadAfterMinutes;
  if (typeof minutes === 'number') setLlmIdleMinutes(minutes);
}

function applyProjectsFolderFromSettings(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  const folder = (value as { projectsFolder?: unknown }).projectsFolder;
  if (typeof folder === 'string' && folder.trim()) {
    setProjectsFolderPath(folder);
  }
}

function migrateLegacyLibraryFromStore(): void {
  for (const key of ['subtitle-cache', 'subtitle-versions'] as const) {
    if (!store.has(key)) continue;
    const value = store.get(key);
    if (value !== undefined && readLibraryJson(key) === undefined) {
      writeLibraryJson(key, value);
    }
    store.delete(key);
  }
  migrateLibraryIntoProjects();
}

function persistProjectsFolder(folder: string): string {
  const resolved = setProjectsFolderPath(folder);
  const current = store.get('settings');
  const decrypted = current && typeof current === 'object'
    ? decryptApiKeys(current as Record<string, unknown>)
    : {};
  store.set('settings', encryptApiKeys({ ...decrypted, projectsFolder: resolved, projectsFolderSet: true }));
  migrateLegacyLibraryFromStore();
  return resolved;
}

async function pickProjectsFolderDialog(): Promise<string | null> {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Projects folder',
    defaultPath: peekProjectsFolder(),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return path.resolve(result.filePaths[0]);
}

function shutdownSublibrServices(): void {
  stopLocalLlm();
  killFfmpegJobs();
  killAllChildren();
  stopMediaServer();
}


app.whenReady().then(async () => {
  const savedSettings = store.get('settings');
  const savedFolder = savedSettings && typeof savedSettings === 'object'
    ? (savedSettings as { projectsFolder?: unknown }).projectsFolder
    : undefined;
  if (typeof savedFolder === 'string' && savedFolder.trim()) {
    setProjectsFolderPath(savedFolder);
    migrateLegacyLibraryFromStore();
  }
  await startMediaServer();
  applyIdleMinutesFromSettings(savedSettings);

  // Register media:// protocol for streaming files
  protocol.handle('media', async (request) => {
    const url = request.url.replace('media://', '');
    try {
      if (!mediaServerPort) await startMediaServer();
      if (!mediaServerPort) return new Response('Media server not ready', { status: 503 });
      const redirectUrl = `http://localhost:${mediaServerPort}/stream?file=${url}`;

      return new Response(null, {
        status: 302,
        headers: {
          'Location': redirectUrl
        }
      });
    } catch (error) {
      console.error('Media protocol error:', error);
      return new Response('Error', { status: 500 });
    }
  });

  createWindow();
});

app.on('window-all-closed', () => {
  shutdownSublibrServices();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

const WORK_FILE_RE = /^(chunk_\d+.*\.(flac|mp3)|gap_heal_\d+.*\.(flac|mp3)|subtitles_gen_audio_\d+\.(flac|mp3)|sublibr_subs_burn\.(srt|ass)|sublibr-whisper-.*)$/;

// Clean up working audio/json created during transcription
function cleanupTempAudioFiles() {
  const dirs = new Set([getWorkDir(), app.getPath('temp')]);
  for (const dir of dirs) {
    try {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        if (WORK_FILE_RE.test(entry)) {
          try { fs.unlinkSync(path.join(dir, entry)); } catch { /* best-effort */ }
        }
      }
    } catch {
      // Best-effort — don't throw
    }
  }
}

app.on('before-quit', () => {
  appendSessionEvent({ source: 'main', event: 'app.beforeQuit' });
  shutdownSublibrServices();
  cleanupTempAudioFiles();
});

installIpcLogging(ipcMain);

ipcMain.handle('file:cleanupTempAudio', () => cleanupTempAudioFiles());

app.on('activate', () => {
  startMediaServer();
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ============== Auto-Updater ==============

// Only enable auto-updates in packaged builds (not during development)
if (app.isPackaged) {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // Check for updates after a short delay on startup
  app.whenReady().then(() => {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {
        // Silently ignore — network may be unavailable
      });
    }, 5000);
  });

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update-download-progress', {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update-downloaded', {
      version: info.version,
    });
  });

  autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send('update-error', err.message);
  });
}

// ============== IPC Handlers ==============

// ============== API Key Encryption Helpers ==============
// Encrypt/decrypt apiKey fields within the settings object using OS keychain.

const ENC_PREFIX = 'enc:';

function encryptApiKeys(settings: Record<string, unknown>): Record<string, unknown> {
  if (!safeStorage.isEncryptionAvailable()) return settings;
  const providers = settings.providers as Record<string, Record<string, unknown>> | undefined;
  if (!providers) return settings;

  const encrypted = { ...settings, providers: { ...providers } };
  for (const name of Object.keys(encrypted.providers as Record<string, Record<string, unknown>>)) {
    const provider = { ...(encrypted.providers as Record<string, Record<string, unknown>>)[name] };
    if (typeof provider.apiKey === 'string' && provider.apiKey && !provider.apiKey.startsWith(ENC_PREFIX)) {
      provider.apiKey = ENC_PREFIX + safeStorage.encryptString(provider.apiKey).toString('base64');
    }
    (encrypted.providers as Record<string, Record<string, unknown>>)[name] = provider;
  }
  return encrypted;
}

function decryptApiKeys(settings: Record<string, unknown>): Record<string, unknown> {
  if (!safeStorage.isEncryptionAvailable()) return settings;
  const providers = settings.providers as Record<string, Record<string, unknown>> | undefined;
  if (!providers) return settings;

  const decrypted = { ...settings, providers: { ...providers } };
  for (const name of Object.keys(decrypted.providers as Record<string, Record<string, unknown>>)) {
    const provider = { ...(decrypted.providers as Record<string, Record<string, unknown>>)[name] };
    if (typeof provider.apiKey === 'string' && provider.apiKey.startsWith(ENC_PREFIX)) {
      try {
        const buf = Buffer.from(provider.apiKey.slice(ENC_PREFIX.length), 'base64');
        provider.apiKey = safeStorage.decryptString(buf);
      } catch {
        // If decryption fails, leave as-is (key may have been corrupted)
      }
    }
    (decrypted.providers as Record<string, Record<string, unknown>>)[name] = provider;
  }
  return decrypted;
}

// Settings
ipcMain.handle('store:get', (_event, key: string) => {
  if (typeof key !== 'string' || !ALLOWED_STORE_KEYS.includes(key)) {
    throw new Error(`Invalid store key: ${key}`);
  }
  if (isLibraryKey(key)) {
    return assembleLibraryMap(key);
  }
  const value = store.get(key);
  if (key === 'settings' && value && typeof value === 'object') {
    return decryptApiKeys(value as Record<string, unknown>);
  }
  return value;
});

ipcMain.handle('store:set', (_event, key: string, value: unknown) => {
  if (typeof key !== 'string' || !ALLOWED_STORE_KEYS.includes(key)) {
    throw new Error(`Invalid store key: ${key}`);
  }
  if (isLibraryKey(key)) {
    writeLibraryMap(key, value);
    return;
  }
  if (key === 'settings' && value && typeof value === 'object') {
    store.set(key, encryptApiKeys(value as Record<string, unknown>));
    applyIdleMinutesFromSettings(value);
    applyProjectsFolderFromSettings(value);
  } else {
    store.set(key, value);
  }
});

ipcMain.handle('store:delete', (_event, key: string) => {
  if (typeof key !== 'string' || !ALLOWED_STORE_KEYS.includes(key)) {
    throw new Error(`Invalid store key: ${key}`);
  }
  if (isLibraryKey(key)) {
    return;
  }
  store.delete(key);
});

// File dialogs
ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [
      { name: 'Media Files', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'ts', 'mts', 'm2ts', 'mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac', 'wma', 'alac', 'aiff'] },
    ],
  });
  const filePath = result.filePaths[0] || null;
  if (filePath) allowedPaths.add(path.resolve(filePath));
  return filePath;
});

ipcMain.handle('dialog:openImport', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile', 'openDirectory'],
    filters: [
      {
        name: 'Supported files',
        extensions: [
          'mp4', 'mkv', 'avi', 'mov', 'webm', 'ts', 'mts', 'm2ts',
          'mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac', 'wma', 'alac', 'aiff',
          'srt', 'vtt', 'ass', 'ssa', 'sublibr',
        ],
      },
      { name: 'Media', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'ts', 'mts', 'm2ts', 'mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac', 'wma', 'alac', 'aiff'] },
      { name: 'Subtitles', extensions: ['srt', 'vtt', 'ass', 'ssa'] },
      { name: 'Sublibr project', extensions: ['sublibr'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  const filePath = result.filePaths[0] || null;
  if (filePath) allowedPaths.add(path.resolve(filePath));
  return filePath;
});

ipcMain.handle('dialog:openSubtitleFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [
      { name: 'Subtitle Files', extensions: ['srt', 'vtt', 'ass', 'ssa'] },
    ],
  });
  const filePath = result.filePaths[0] || null;
  if (filePath) allowedPaths.add(path.resolve(filePath));
  return filePath;
});

ipcMain.handle('dialog:saveFile', async (_event, defaultName: string, filterName?: string, filterExtensions?: string[]) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: defaultName,
    filters: [{ name: filterName || 'Subtitle File', extensions: filterExtensions || [defaultName.split('.').pop() || 'srt'] }],
  });
  const filePath = result.filePath || null;
  if (filePath) allowedPaths.add(path.resolve(filePath));
  return filePath;
});

ipcMain.handle('dialog:showMessageBox', async (_event, options: Electron.MessageBoxOptions) => {
  return dialog.showMessageBox(mainWindow!, options);
});

// File operations
ipcMain.handle('file:read', async (_event, filePath: string) => {
  const safePath = validatePath(filePath, ...getAllowedDirs());
  return fs.promises.readFile(safePath);
});



ipcMain.handle('file:write', async (_event, filePath: string, data: string) => {
  const safePath = validatePath(filePath, ...getAllowedDirs());
  await fs.promises.writeFile(safePath, data, 'utf-8');
});

ipcMain.handle('file:getInfo', async (_event, filePath: string) => {
  const safePath = validatePath(filePath, ...getAllowedDirs());
  const stats = await fs.promises.stat(safePath);
  return {
    size: stats.size,
    path: safePath,
    name: path.basename(safePath),
    ext: path.extname(safePath).toLowerCase(),
  };
});

ipcMain.handle('file:getTempPath', () => {
  return getWorkDir();
});

ipcMain.handle('projects:getFolder', () => {
  return getProjectsFolder();
});

ipcMain.handle('projects:getDefaultFolder', () => {
  return defaultProjectsFolder();
});

ipcMain.handle('projects:pickFolder', async () => {
  return pickProjectsFolderDialog();
});

ipcMain.handle('projects:confirmFolder', (_event, folder: unknown) => {
  const chosen = typeof folder === 'string' && folder.trim()
    ? folder
    : defaultProjectsFolder();
  return persistProjectsFolder(chosen);
});

ipcMain.handle('projects:chooseFolder', async () => {
  const picked = await pickProjectsFolderDialog();
  if (!picked) return null;
  const folder = migrateLibraryTo(picked);
  return persistProjectsFolder(folder);
});

ipcMain.handle('projects:list', () => {
  return listProjects();
});

ipcMain.handle('projects:create', (_event, name: unknown) => {
  const label = typeof name === 'string' && name.trim() ? name.trim() : 'Untitled Project';
  return createProject(label);
});

ipcMain.handle('projects:open', async (_event, ref: unknown) => {
  if (typeof ref !== 'string' || !ref.trim()) {
    throw new Error('Invalid project');
  }
  allowedPaths.add(path.resolve(ref));
  const loaded = await openProjectAndCollect(ref);
  if (loaded?.mediaPath) allowedPaths.add(path.resolve(loaded.mediaPath));
  if (loaded?.dir) allowedPaths.add(path.resolve(loaded.dir));
  return loaded;
});

ipcMain.handle('projects:createFromMedia', async (_event, payload: unknown) => {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid media payload');
  const { sourcePath, name, duration, width, height, size, isVideo } = payload as {
    sourcePath?: unknown;
    name?: unknown;
    duration?: unknown;
    width?: unknown;
    height?: unknown;
    size?: unknown;
    isVideo?: unknown;
  };
  if (typeof sourcePath !== 'string' || !sourcePath.trim()) {
    throw new Error('Invalid source path');
  }
  const resolved = path.resolve(sourcePath);
  allowedPaths.add(resolved);
  const loaded = await createProjectFromMedia(resolved, {
    name: typeof name === 'string' ? name : undefined,
    duration: typeof duration === 'number' ? duration : undefined,
    width: typeof width === 'number' ? width : undefined,
    height: typeof height === 'number' ? height : undefined,
    size: typeof size === 'number' ? size : undefined,
    isVideo: typeof isVideo === 'boolean' ? isVideo : undefined,
  });
  if (loaded.mediaPath) allowedPaths.add(path.resolve(loaded.mediaPath));
  return loaded;
});

ipcMain.handle('projects:collectMedia', async (_event, payload: unknown) => {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid collect payload');
  const { projectDir, sourcePath, duration, width, height, size, isVideo } = payload as {
    projectDir?: unknown;
    sourcePath?: unknown;
    duration?: unknown;
    width?: unknown;
    height?: unknown;
    size?: unknown;
    isVideo?: unknown;
  };
  if (typeof projectDir !== 'string' || !projectDir.trim()) throw new Error('Invalid project folder');
  if (typeof sourcePath !== 'string' || !sourcePath.trim()) throw new Error('Invalid source path');
  allowedPaths.add(path.resolve(sourcePath));
  const loaded = await collectMedia(projectDir, sourcePath, {
    duration: typeof duration === 'number' ? duration : undefined,
    width: typeof width === 'number' ? width : undefined,
    height: typeof height === 'number' ? height : undefined,
    size: typeof size === 'number' ? size : undefined,
    isVideo: typeof isVideo === 'boolean' ? isVideo : undefined,
  });
  if (loaded.mediaPath) allowedPaths.add(path.resolve(loaded.mediaPath));
  return loaded;
});

ipcMain.handle('projects:delete', async (_event, projectDir: unknown) => {
  if (typeof projectDir !== 'string' || !projectDir.trim()) {
    throw new Error('Invalid project folder');
  }
  await deleteProject(projectDir);
});

ipcMain.handle('projects:duplicate', async (_event, projectDir: unknown) => {
  if (typeof projectDir !== 'string' || !projectDir.trim()) {
    throw new Error('Invalid project folder');
  }
  return duplicateProject(projectDir);
});

ipcMain.handle('projects:rename', (_event, payload: unknown) => {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid rename payload');
  const { projectDir, name, renameFolder } = payload as {
    projectDir?: unknown;
    name?: unknown;
    renameFolder?: unknown;
  };
  if (typeof projectDir !== 'string' || !projectDir.trim()) {
    throw new Error('Invalid project folder');
  }
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('Enter a project name');
  }
  return renameProject(projectDir, name, { renameFolder: renameFolder !== false });
});

ipcMain.handle('dialog:openProject', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile', 'openDirectory'],
    filters: [
      { name: 'Sublibr Project', extensions: ['sublibr'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  const filePath = result.filePaths[0] || null;
  if (filePath) allowedPaths.add(path.resolve(filePath));
  return filePath;
});

ipcMain.handle('projects:load', (_event, sourcePath: unknown) => {
  if (typeof sourcePath !== 'string' || !sourcePath.trim()) {
    throw new Error('Invalid source path');
  }
  return loadProject(sourcePath);
});

ipcMain.handle('projects:save', (_event, payload: unknown) => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid project payload');
  }
  const { projectDir, sourcePath, name, subtitles, versions } = payload as {
    projectDir?: unknown;
    sourcePath?: unknown;
    name?: unknown;
    subtitles?: unknown;
    versions?: unknown;
  };
  if (typeof projectDir === 'string' && projectDir.trim()) {
    return saveProjectData(projectDir, {
      name: typeof name === 'string' ? name : undefined,
      subtitles,
      versions,
    });
  }
  if (typeof sourcePath !== 'string' || !sourcePath.trim()) {
    throw new Error('Invalid source path');
  }
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('Invalid project name');
  }
  return saveProject(sourcePath, name, { subtitles, versions });
});

ipcMain.handle('session:bind', (_event, payload: unknown) => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid session payload');
  }
  const { projectDir, sourcePath, name, media, settings } = payload as {
    projectDir?: unknown;
    sourcePath?: unknown;
    name?: unknown;
    media?: unknown;
    settings?: unknown;
  };
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('Invalid project name');
  }
  if ((typeof projectDir !== 'string' || !projectDir.trim())
    && (typeof sourcePath !== 'string' || !sourcePath.trim())) {
    throw new Error('Invalid project folder');
  }
  return bindSession({
    projectDir: typeof projectDir === 'string' ? projectDir : undefined,
    sourcePath: typeof sourcePath === 'string' ? sourcePath : undefined,
    name,
    media,
    settings,
  });
});

ipcMain.handle('session:log', (_event, payload: unknown) => {
  if (!payload || typeof payload !== 'object') return;
  const { event, data, level } = payload as {
    event?: unknown;
    data?: unknown;
    level?: unknown;
  };
  if (typeof event !== 'string' || !event.trim()) return;
  const safeLevel = level === 'error' || level === 'warn' || level === 'info' ? level : 'info';
  appendSessionEvent({
    source: 'renderer',
    event,
    data,
    level: safeLevel,
  });
});

// Only allow registering paths to supported media files (for drag-and-drop)
const ALLOWED_MEDIA_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.webm', '.ts', '.mts', '.m2ts',
  '.mp3', '.wav', '.m4a', '.flac', '.ogg', '.aac', '.wma', '.alac', '.aiff',
]);
const ALLOWED_DROP_EXTENSIONS = new Set([
  ...ALLOWED_MEDIA_EXTENSIONS,
  '.sublibr',
  '.srt', '.vtt', '.ass', '.ssa',
]);

ipcMain.handle('file:registerPath', (_event, filePath: string) => {
  if (typeof filePath !== 'string') return;
  const resolved = path.resolve(filePath);
  try {
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      allowedPaths.add(resolved);
      return;
    }
  } catch {
    // fall through to extension check
  }
  const ext = path.extname(resolved).toLowerCase();
  if (!ALLOWED_DROP_EXTENSIONS.has(ext)) {
    throw new Error('Only media, subtitle, or project files can be registered');
  }
  allowedPaths.add(resolved);
});

// FFmpeg: Extract audio
ipcMain.handle('ffmpeg:extractAudio', async (_event, inputPath: string, outputPath: string, format: string = 'flac') => {
  const safeInput = validatePath(inputPath, ...getAllowedDirs());
  const safeOutput = validatePath(outputPath, ...getAllowedDirs());

  const codec = format === 'mp3' ? 'libmp3lame' : 'flac';

  return new Promise((resolve, reject) => {
    let cmd = ffmpeg(safeInput)
      .audioCodec(codec)
      .toFormat(format);

    if (format === 'mp3') {
      cmd = cmd.audioBitrate('64k').audioChannels(1).audioFrequency(16000);
    }

    cmd
      .on('progress', (progress) => {
        mainWindow?.webContents.send('ffmpeg:extractAudioProgress', {
          percent: Math.min(99, Math.round(progress.percent || 0)),
        });
      })
      .on('end', () => resolve(safeOutput))
      .on('error', (err) => {
        console.error('[FFmpeg] Audio extraction error:', err.message);
        reject(new Error(`Audio extraction failed: ${err.message}`));
      })
      .save(safeOutput);
    trackFfmpeg(cmd);
  });
});

// FFmpeg: Get media duration
ipcMain.handle('ffmpeg:getDuration', async (_event, filePath: string) => {
  const safePath = validatePath(filePath, ...getAllowedDirs());
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(safePath, (err, data) => {
      if (err) reject(err.message);
      else resolve(data.format.duration || 0);
    });
  });
});

// FFmpeg: Get video info (duration + dimensions)
ipcMain.handle('ffmpeg:getVideoInfo', async (_event, filePath: string) => {
  const safePath = validatePath(filePath, ...getAllowedDirs());
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(safePath, (err, data) => {
      if (err) reject(err.message);
      else {
        const videoStream = data.streams.find(s => s.codec_type === 'video');
        resolve({
          duration: data.format.duration || 0,
          width: videoStream?.width ?? null,
          height: videoStream?.height ?? null,
        });
      }
    });
  });
});

// FFmpeg: Detect silences
ipcMain.handle('ffmpeg:detectSilences', async (_event, filePath: string, threshold: number, minDuration: number) => {
  const safePath = validatePath(filePath, ...getAllowedDirs());

  if (!Number.isFinite(threshold) || threshold < -100 || threshold > 0) {
    throw new Error('Invalid threshold: must be between -100 and 0');
  }
  if (!Number.isFinite(minDuration) || minDuration < 0.1 || minDuration > 60) {
    throw new Error('Invalid minDuration: must be between 0.1 and 60');
  }

  return new Promise((resolve, reject) => {
    const silences: { start: number; end: number }[] = [];
    let currentSilence: { start: number; end?: number } | null = null;

    trackFfmpeg(ffmpeg(safePath)
      .audioFilters(`silencedetect=noise=${threshold}dB:d=${minDuration}`)
      .format('null')
      .on('stderr', (line: string) => {
        // Parse silence_start
        const startMatch = line.match(/silence_start:\s*([\d.]+)/);
        if (startMatch) {
          currentSilence = { start: parseFloat(startMatch[1]) };
        }
        // Parse silence_end
        const endMatch = line.match(/silence_end:\s*([\d.]+)/);
        if (endMatch && currentSilence) {
          currentSilence.end = parseFloat(endMatch[1]);
          silences.push(currentSilence as { start: number; end: number });
          currentSilence = null;
        }
      })
      .on('end', () => resolve(silences))
      .on('error', (err) => {
        console.error('[FFmpeg] Silence detection error:', err.message);
        reject(new Error(`Silence detection failed: ${err.message}`));
      })
      .output(process.platform === 'win32' ? 'NUL' : '/dev/null')
      .run());
  });
});

// FFmpeg: Split audio at specific times
ipcMain.handle('ffmpeg:splitAudio', async (_event, inputPath: string, chunks: { start: number; end: number; outputPath: string }[], format: string = 'flac') => {
  const safeInput = validatePath(inputPath, ...getAllowedDirs());
  const results: string[] = [];
  const codec = format === 'mp3' ? 'libmp3lame' : 'flac';

  for (const chunk of chunks) {
    const safeOutput = validatePath(chunk.outputPath, ...getAllowedDirs());
    await new Promise<void>((resolve, reject) => {
      trackFfmpeg(ffmpeg(safeInput)
        .setStartTime(chunk.start)
        .setDuration(chunk.end - chunk.start)
        .audioCodec(codec)
        .toFormat(format)
        .outputOptions(format === 'mp3' ? ['-b:a', '64k', '-ac', '1', '-ar', '16000'] : [])
        .on('end', () => {
          results.push(safeOutput);
          resolve();
        })
        .on('error', (err) => {
          console.error(`[FFmpeg] Split audio chunk error:`, err.message);
          reject(new Error(`Audio split failed: ${err.message}`));
        })
        .save(safeOutput));
    });
  }

  return results;
});

// FFmpeg: Burn subtitles into video
ipcMain.handle('ffmpeg:burnSubtitles', async (_event, inputPath: string, subtitleContent: string, outputPath: string, targetWidth: number | null, targetHeight: number | null, subtitleFormat: 'srt' | 'ass' = 'ass') => {
  const safeInput = validatePath(inputPath, ...getAllowedDirs());
  const safeOutput = validatePath(outputPath, ...getAllowedDirs());

  const tempDir = getWorkDir();
  const tempSrtPath = path.join(tempDir, `sublibr_subs_burn.${subtitleFormat}`);
  await fs.promises.writeFile(tempSrtPath, subtitleContent, 'utf-8');

  // Escape the SRT path for use inside an FFmpeg filter expression
  let escapedSrtPath: string;
  if (process.platform === 'win32') {
    escapedSrtPath = tempSrtPath.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '$1\\:');
  } else {
    escapedSrtPath = tempSrtPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
  }

  // Build video filter: scale+letterbox to target resolution, then burn subtitles.
  // If no target is specified, burn subtitles at the source resolution unchanged.
  const videoFilter = (targetWidth && targetHeight)
    ? `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:black,subtitles='${escapedSrtPath}'`
    : `subtitles='${escapedSrtPath}'`;

  return new Promise((resolve, reject) => {
    trackFfmpeg(ffmpeg(safeInput)
      .videoFilters(videoFilter)
      .outputOptions(['-c:a', 'copy'])
      .on('progress', (progress) => {
        mainWindow?.webContents.send('ffmpeg:burnSubtitlesProgress', {
          percent: Math.min(99, Math.round(progress.percent || 0)),
        });
      })
      .on('end', async () => {
        await fs.promises.unlink(tempSrtPath).catch(() => {});
        mainWindow?.webContents.send('ffmpeg:burnSubtitlesProgress', { percent: 100 });
        resolve(safeOutput);
      })
      .on('error', async (err) => {
        await fs.promises.unlink(tempSrtPath).catch(() => {});
        reject(err.message);
      })
      .save(safeOutput));
  });
});

ipcMain.handle('app:getVersion', () => {
  return app.getVersion();
});

ipcMain.handle('app:checkForUpdates', async () => {
  if (!app.isPackaged) return { updateAvailable: false };
  try {
    const result = await autoUpdater.checkForUpdates();
    return { updateAvailable: !!result?.updateInfo };
  } catch {
    return { updateAvailable: false };
  }
});

ipcMain.handle('app:downloadUpdate', async () => {
  if (!app.isPackaged) return;
  await autoUpdater.downloadUpdate();
});

ipcMain.handle('app:installUpdate', () => {
  autoUpdater.quitAndInstall(false, true);
});

// ============== AI API Proxy ==============
// All AI calls go through the main process so API keys are never exposed in the renderer.

type AIProvider = 'gemini' | 'anthropic' | 'openai' | 'local';

function describeApiNetworkError(error: unknown): string {
  const err = error as { message?: string; cause?: { message?: string; code?: string } };
  const msg = [err?.message, err?.cause?.message, err?.cause?.code].filter(Boolean).join(' ');
  console.error('[ai:testApiKey] network error', error);
  if (/could not reach the api|net::|ERR_FAILED|Failed to fetch|fetch failed|ENOTFOUND|ENETUNREACH|ECONNRESET|ETIMEDOUT|ECONNREFUSED|certificate|CERT_/i.test(msg)) {
    return 'Could not reach the API. Check your internet connection, then tap Test again.';
  }
  return err?.message || 'Network error';
}

ipcMain.handle('ai:testApiKey', async (_event, provider: AIProvider, apiKey: string) => {
  try {
    switch (provider) {
      case 'gemini': {
        const res = await mainFetch(
          'https://generativelanguage.googleapis.com/v1beta/models',
          { headers: { 'x-goog-api-key': apiKey }, timeout: 20_000 },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
          return { ok: false, error: err.error?.message || `HTTP ${res.status}` };
        }
        return { ok: true };
      }
      case 'anthropic': {
        const res = await mainFetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          timeout: 20_000,
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'ping' }],
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
          return { ok: false, error: err.error?.message || `HTTP ${res.status}` };
        }
        return { ok: true };
      }
      case 'openai': {
        const res = await mainFetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` },
          timeout: 20_000,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
          return { ok: false, error: err.error?.message || `HTTP ${res.status}` };
        }
        return { ok: true };
      }
      case 'local': {
        const whisper = await probeLocalWhisper();
        const llm = await probeLocalLlm();
        if (!whisper.ok && !llm.ok) {
          return { ok: false, error: whisper.error || llm.error };
        }
        return {
          ok: true,
          error: whisper.ok ? undefined : whisper.error,
          llm: llm.ok,
          llmError: llm.error,
        };
      }
    }
  } catch (e) {
    return { ok: false, error: describeApiNetworkError(e) };
  }
});

ipcMain.handle('ai:callProvider', async (
  _event,
  provider: AIProvider,
  apiKey: string,
  model: string,
  prompt: string,
  audioBase64: string,
  audioFormat: string = 'flac',
  language?: string | null,
  previousTranscript?: string,
) => {
  const mimeType = `audio/${audioFormat}`;

  switch (provider) {
    case 'gemini':
      return callGeminiAudio(apiKey, model, prompt, audioBase64, mimeType, language);
    case 'openai':
      return callOpenAiAudio(apiKey, model, prompt, audioBase64, audioFormat, mimeType, language, previousTranscript);
    case 'local':
      throw new Error('Local Whisper must be called with a file path, not a cloud audio payload.');
  }
});

ipcMain.handle('ai:callTextProvider', async (
  _event,
  provider: AIProvider,
  apiKey: string,
  model: string,
  prompt: string,
) => {
  switch (provider) {
    case 'gemini':
      return callGeminiText(apiKey, model, prompt);
    case 'openai':
      return callOpenAiText(apiKey, model, prompt);
    case 'local':
      return callLocalText(model, prompt);
  }
});

ipcMain.handle('ai:stopLocalLlm', () => {
  stopLocalLlm();
});

ipcMain.handle('ai:callLocalTranscribe', async (_event, filePath: string, language?: string | null, model?: string) => {
  const safePath = validatePath(filePath, ...getAllowedDirs());
  return transcribeLocal(safePath, language, model);
});

