import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import ffmpeg from 'fluent-ffmpeg';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============== Security: Path Validation ==============

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
    app.getPath('temp'),
    app.getPath('userData'),
  ];
}

// ============== Security: Store Key Allowlist ==============

const ALLOWED_STORE_KEYS = ['settings'];

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
    backgroundColor: '#0a0a0f',
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

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean up temp audio files on quit
app.on('before-quit', () => {
  try {
    const tempDir = app.getPath('temp');
    const entries = fs.readdirSync(tempDir);
    for (const entry of entries) {
      if (/^(chunk_\d+\.flac|gap_heal_\d+.*\.mp3)$/.test(entry)) {
        fs.unlinkSync(path.join(tempDir, entry));
      }
    }
  } catch {
    // Best-effort cleanup — don't block quit
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ============== IPC Handlers ==============

// Settings
ipcMain.handle('store:get', (_event, key: string) => {
  if (typeof key !== 'string' || !ALLOWED_STORE_KEYS.includes(key)) {
    throw new Error(`Invalid store key: ${key}`);
  }
  return store.get(key);
});

ipcMain.handle('store:set', (_event, key: string, value: unknown) => {
  if (typeof key !== 'string' || !ALLOWED_STORE_KEYS.includes(key)) {
    throw new Error(`Invalid store key: ${key}`);
  }
  store.set(key, value);
});

// File dialogs
ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [
      { name: 'Media Files', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac'] },
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

ipcMain.handle('dialog:saveFile', async (_event, defaultName: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: defaultName,
    filters: [{ name: 'SRT Subtitle', extensions: ['srt'] }],
  });
  const filePath = result.filePath || null;
  if (filePath) allowedPaths.add(path.resolve(filePath));
  return filePath;
});

// File operations
ipcMain.handle('file:read', async (_event, filePath: string) => {
  const safePath = validatePath(filePath, ...getAllowedDirs());
  return fs.promises.readFile(safePath);
});

ipcMain.handle('file:readAsDataUrl', async (_event, filePath: string) => {
  const safePath = validatePath(filePath, ...getAllowedDirs());
  const data = await fs.promises.readFile(safePath);
  const ext = path.extname(safePath).toLowerCase().slice(1);
  const mimeTypes: Record<string, string> = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    flac: 'audio/flac',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
  };
  const mimeType = mimeTypes[ext] || 'application/octet-stream';
  return `data:${mimeType};base64,${data.toString('base64')}`;
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
  return app.getPath('temp');
});

ipcMain.handle('file:registerPath', (_event, filePath: string) => {
  if (typeof filePath === 'string') {
    allowedPaths.add(path.resolve(filePath));
  }
});

// FFmpeg: Extract audio to FLAC
ipcMain.handle('ffmpeg:extractAudio', async (_event, inputPath: string, outputPath: string) => {
  const safeInput = validatePath(inputPath, ...getAllowedDirs());
  const safeOutput = validatePath(outputPath, ...getAllowedDirs());
  return new Promise((resolve, reject) => {
    ffmpeg(safeInput)
      .audioCodec('flac')
      .toFormat('flac')
      .on('end', () => resolve(safeOutput))
      .on('error', (err) => reject(err.message))
      .save(safeOutput);
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

    ffmpeg(safePath)
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
      .on('error', (err) => reject(err.message))
      .output(process.platform === 'win32' ? 'NUL' : '/dev/null')
      .run();
  });
});

// FFmpeg: Split audio at specific times
ipcMain.handle('ffmpeg:splitAudio', async (_event, inputPath: string, chunks: { start: number; end: number; outputPath: string }[]) => {
  const safeInput = validatePath(inputPath, ...getAllowedDirs());
  const results: string[] = [];

  for (const chunk of chunks) {
    const safeOutput = validatePath(chunk.outputPath, ...getAllowedDirs());
    await new Promise<void>((resolve, reject) => {
      ffmpeg(safeInput)
        .setStartTime(chunk.start)
        .setDuration(chunk.end - chunk.start)
        .audioCodec('flac')
        .toFormat('flac')
        .on('end', () => {
          results.push(safeOutput);
          resolve();
        })
        .on('error', (err) => reject(err.message))
        .save(safeOutput);
    });
  }

  return results;
});
