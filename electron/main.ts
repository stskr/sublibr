import { app, BrowserWindow, ipcMain, dialog, shell, net, safeStorage, protocol } from 'electron';
import http from 'http';


import path from 'path';
import fs from 'fs';
// Removed stream import
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import ffmpeg from 'fluent-ffmpeg';
import { WHISPER_PUNCTUATION_PROMPT } from '../src/prompts/whisper';
import { createRequire } from 'module';
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
    app.getPath('temp'),
    app.getPath('userData'),
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
let mediaServerPort = 0;

function startMediaServer() {
  const server = http.createServer(async (req, res) => {
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

      const url = new URL(req.url || '', `http://localhost:${mediaServerPort}`);
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

  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (address && typeof address !== 'string') {
      mediaServerPort = address.port;
      console.log(`Media server listening on port ${mediaServerPort}`);
    }
  });
}


app.whenReady().then(() => {
  // Register media:// protocol for streaming files
  startMediaServer();

  // Register media:// protocol for streaming files
  protocol.handle('media', (request) => {
    const url = request.url.replace('media://', '');
    try {
      // Just redirect to the local server
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
      if (/^(chunk_\d+\.flac|gap_heal_\d+.*\.flac|subtitles_gen_audio_\d+\.flac)$/.test(entry)) {
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
  if (key === 'settings' && value && typeof value === 'object') {
    store.set(key, encryptApiKeys(value as Record<string, unknown>));
  } else {
    store.set(key, value);
  }
});

ipcMain.handle('store:delete', (_event, key: string) => {
  if (typeof key !== 'string' || !ALLOWED_STORE_KEYS.includes(key)) {
    throw new Error(`Invalid store key: ${key}`);
  }
  store.delete(key);
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
  return app.getPath('temp');
});

// Only allow registering paths to supported media files (for drag-and-drop)
const ALLOWED_MEDIA_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.webm', '.ts', '.mts', '.m2ts',
  '.mp3', '.wav', '.m4a', '.flac', '.ogg', '.aac', '.wma', '.alac', '.aiff',
]);

ipcMain.handle('file:registerPath', (_event, filePath: string) => {
  if (typeof filePath !== 'string') return;
  const resolved = path.resolve(filePath);
  const ext = path.extname(resolved).toLowerCase();
  if (!ALLOWED_MEDIA_EXTENSIONS.has(ext)) {
    throw new Error('Only media files can be registered');
  }
  allowedPaths.add(resolved);
});

// FFmpeg: Extract audio
ipcMain.handle('ffmpeg:extractAudio', async (_event, inputPath: string, outputPath: string, format: string = 'flac') => {
  const safeInput = validatePath(inputPath, ...getAllowedDirs());
  const safeOutput = validatePath(outputPath, ...getAllowedDirs());

  const codec = format === 'mp3' ? 'libmp3lame' : 'flac';

  return new Promise((resolve, reject) => {
    ffmpeg(safeInput)
      .audioCodec(codec)
      .toFormat(format)
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
ipcMain.handle('ffmpeg:splitAudio', async (_event, inputPath: string, chunks: { start: number; end: number; outputPath: string }[], format: string = 'flac') => {
  const safeInput = validatePath(inputPath, ...getAllowedDirs());
  const results: string[] = [];
  const codec = format === 'mp3' ? 'libmp3lame' : 'flac';

  for (const chunk of chunks) {
    const safeOutput = validatePath(chunk.outputPath, ...getAllowedDirs());
    await new Promise<void>((resolve, reject) => {
      ffmpeg(safeInput)
        .setStartTime(chunk.start)
        .setDuration(chunk.end - chunk.start)
        .audioCodec(codec)
        .toFormat(format)
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

// ============== App Update IPC ==============

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

type AIProvider = 'gemini' | 'anthropic' | 'openai';

ipcMain.handle('ai:testApiKey', async (_event, provider: AIProvider, apiKey: string) => {
  try {
    switch (provider) {
      case 'gemini': {
        const res = await net.fetch(
          'https://generativelanguage.googleapis.com/v1beta/models',
          { headers: { 'x-goog-api-key': apiKey } },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
          return { ok: false, error: err.error?.message || `HTTP ${res.status}` };
        }
        return { ok: true };
      }
      case 'anthropic': {
        const res = await net.fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
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
        const res = await net.fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
          return { ok: false, error: err.error?.message || `HTTP ${res.status}` };
        }
        return { ok: true };
      }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
  }
});

ipcMain.handle('ai:callProvider', async (
  _event,
  provider: AIProvider,
  apiKey: string,
  model: string,
  prompt: string,
  audioBase64: string,
  audioFormat: string = 'flac', // Default to flac
  language?: string | null,
  previousTranscript?: string,
) => {
  const mimeType = `audio/${audioFormat}`;

  switch (provider) {
    case 'gemini': {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const geminiModel = genAI.getGenerativeModel({ model });

      const result = await geminiModel.generateContent([
        prompt,
        {
          inlineData: {
            mimeType: mimeType,
            data: audioBase64,
          },
        },
      ]);

      const response = await result.response;
      const usage = response.usageMetadata;

      return {
        text: response.text(),
        tokenUsage: {
          inputTokens: usage?.promptTokenCount ?? 0,
          outputTokens: usage?.candidatesTokenCount ?? 0,
          provider: 'gemini',
          model,
          timestamp: Date.now(),
        },
      };
    }



    case 'openai': {
      // Check if using a chat model (gpt-4o) or legacy whisper
      const isChatModel = model.startsWith('gpt-4o');

      if (isChatModel) {
        // Chat Completions API with Audio Input
        // Docs: https://platform.openai.com/docs/guides/audio?lang=node

        let mappedModel = model;
        // The standard gpt-4o and gpt-4o-mini models do not support audio input blocks.
        // We must use the specific audio-preview models.
        if (model === 'gpt-4o') {
          mappedModel = 'gpt-4o-audio-preview';
        } else if (model === 'gpt-4o-mini') {
          mappedModel = 'gpt-4o-mini-audio-preview';
        }

        const formatOption = audioFormat === 'mp3' ? 'mp3' : 'wav';
        const messages = [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'input_audio',
                input_audio: {
                  data: audioBase64,
                  format: formatOption, // OpenAI supports wav, mp3. 
                },
              },
            ],
          },
        ];

        const res = await net.fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: mappedModel,
            modalities: ['text'], // We only want text back
            messages: messages,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: { message: res.statusText } })) as { error?: { message?: string } };
          throw new Error(`OpenAI API error: ${err.error?.message || res.statusText}`);
        }

        const data = await res.json() as {
          choices: { message: { content: string } }[];
          usage?: { prompt_tokens: number; completion_tokens: number };
        };

        const text = data.choices[0]?.message?.content || '';

        return {
          text,
          tokenUsage: {
            inputTokens: data.usage?.prompt_tokens || 0,
            outputTokens: data.usage?.completion_tokens || 0,
            provider: 'openai',
            model,
            timestamp: Date.now(),
          },
        };

      } else {
        // Legacy Whisper API (audio/transcriptions)
        const buffer = Buffer.from(audioBase64, 'base64');
        const blob = new Blob([buffer], { type: mimeType });

        const formData = new FormData();
        formData.append('file', blob, `audio.${audioFormat}`);
        formData.append('model', 'whisper-1');
        formData.append('response_format', 'srt');

        if (language) {
          formData.append('language', language);
        }

        // We can't pass the full complex prompt to Whisper in the same way, 
        // but we can pass a "prompt" for context/style. 
        // By passing properly punctuated sentences, we strongly coerce Whisper 
        // to return punctuated sentences instead of long unpunctuated blocks.
        let finalPrompt = WHISPER_PUNCTUATION_PROMPT;
        if (previousTranscript) {
          finalPrompt = `${previousTranscript}\n\n${finalPrompt}`;
        }
        formData.append('prompt', finalPrompt);

        // However, since we need specific timestamp formatting, we'll parse the 'verbose_json' result
        // and format it ourselves to match what the app expects ([MM:SS] Text).

        const res = await net.fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: { message: res.statusText } })) as { error?: { message?: string } };
          throw new Error(`OpenAI API error: ${err.error?.message || res.statusText}`);
        }
        const srtText = await res.text();

        return {
          text: srtText,
          tokenUsage: {
            inputTokens: 0,
            outputTokens: 0,
            provider: 'openai',
            model: 'whisper-1',
            timestamp: Date.now(),
          },
        };
      }
    }
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
    case 'gemini': {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const geminiModel = genAI.getGenerativeModel({ model });

      const result = await geminiModel.generateContent(prompt);
      const response = await result.response;
      const usage = response.usageMetadata;

      return {
        text: response.text(),
        tokenUsage: {
          inputTokens: usage?.promptTokenCount ?? 0,
          outputTokens: usage?.candidatesTokenCount ?? 0,
          provider: 'gemini',
          model,
          timestamp: Date.now(),
        },
      };
    }

    case 'openai': {
      // For text-only parsing, we can just use the standard chat completions endpoint
      // gpt-4o, gpt-4o-mini, etc.

      let mappedModel = model;
      // We don't need audio-preview models for text-to-text
      if (model === 'gpt-4o-audio-preview') mappedModel = 'gpt-4o';
      if (model === 'gpt-4o-mini-audio-preview') mappedModel = 'gpt-4o-mini';
      // Whisper cannot do text translations, fall back to mini
      if (model === 'whisper-1') mappedModel = 'gpt-4o-mini';

      const messages = [
        {
          role: 'user',
          content: prompt,
        },
      ];

      const res = await net.fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: mappedModel,
          messages: messages,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: res.statusText } })) as { error?: { message?: string } };
        throw new Error(`OpenAI API error: ${err.error?.message || res.statusText}`);
      }

      const data = await res.json() as {
        choices: { message: { content: string } }[];
        usage?: { prompt_tokens: number; completion_tokens: number };
      };

      const text = data.choices[0]?.message?.content || '';

      return {
        text,
        tokenUsage: {
          inputTokens: data.usage?.prompt_tokens || 0,
          outputTokens: data.usage?.completion_tokens || 0,
          provider: 'openai',
          model,
          timestamp: Date.now(),
        },
      };
    }
  }
});
