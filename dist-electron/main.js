import { protocol, app, BrowserWindow, ipcMain, dialog, net, shell, safeStorage } from "electron";
import http from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import Store from "electron-store";
import ffmpeg from "fluent-ffmpeg";
import { createRequire } from "module";
import pkg from "electron-updater";
const WHISPER_PUNCTUATION_PROMPT = "Transcribe accurately. Use proper punctuation. For example: Hello, world! How are you doing today?";
const { autoUpdater } = pkg;
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
protocol.registerSchemesAsPrivileged([
  {
    scheme: "media",
    privileges: {
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true
    }
  }
]);
const allowedPaths = /* @__PURE__ */ new Set();
function validatePath(filePath, ...allowedDirs) {
  if (typeof filePath !== "string") throw new Error("Invalid path: must be a string");
  const resolved = path.resolve(filePath);
  if (allowedPaths.has(resolved)) return resolved;
  for (const dir of allowedDirs) {
    const resolvedDir = path.resolve(dir);
    if (resolved === resolvedDir || resolved.startsWith(resolvedDir + path.sep)) {
      return resolved;
    }
  }
  throw new Error(`Access denied: path is outside allowed directories`);
}
function getAllowedDirs() {
  return [
    app.getPath("temp"),
    app.getPath("userData")
  ];
}
const ALLOWED_STORE_KEYS = ["settings", "recent-files", "subtitle-cache", "subtitle-versions"];
if (app.isPackaged) {
  const ext = process.platform === "win32" ? ".exe" : "";
  ffmpeg.setFfmpegPath(path.join(process.resourcesPath, "ffmpeg", "ffmpeg" + ext));
  ffmpeg.setFfprobePath(path.join(process.resourcesPath, "ffprobe", "ffprobe" + ext));
} else {
  const _require = createRequire(import.meta.url);
  ffmpeg.setFfmpegPath(_require("@ffmpeg-installer/ffmpeg").path);
  ffmpeg.setFfprobePath(_require("@ffprobe-installer/ffprobe").path);
}
const store = new Store();
let mainWindow = null;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname$1, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0a0a0f"
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const appUrl = process.env.VITE_DEV_SERVER_URL || "file://";
    if (!url.startsWith(appUrl)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname$1, "../dist/index.html"));
  }
}
function getMimeType(ext) {
  const map = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".wma": "audio/x-ms-wma",
    ".alac": "audio/alac",
    ".aiff": "audio/x-aiff",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".ts": "video/mp2t",
    ".mts": "video/mp2t",
    ".m2ts": "video/mp2t"
  };
  return map[ext.toLowerCase()] || "";
}
let mediaServerPort = 0;
function startMediaServer() {
  const server = http.createServer(async (req, res) => {
    try {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Range");
      if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
      }
      const url = new URL(req.url || "", `http://localhost:${mediaServerPort}`);
      if (url.pathname !== "/stream") {
        res.writeHead(404);
        res.end("Not Found");
        return;
      }
      const fileParam = url.searchParams.get("file");
      if (!fileParam) {
        res.writeHead(400);
        res.end("Missing file parameter");
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
        const chunksize = end - start + 1;
        const file = fs.createReadStream(safePath, { start, end });
        const head = {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunksize,
          "Content-Type": mimeType
        };
        res.writeHead(206, head);
        file.pipe(res);
      } else {
        const head = {
          "Content-Length": fileSize,
          "Content-Type": mimeType
        };
        res.writeHead(200, head);
        fs.createReadStream(safePath).pipe(res);
      }
    } catch (error) {
      console.error("Media server error:", error);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end("Internal Server Error");
      }
    }
  });
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (address && typeof address !== "string") {
      mediaServerPort = address.port;
      console.log(`Media server listening on port ${mediaServerPort}`);
    }
  });
}
app.whenReady().then(() => {
  startMediaServer();
  protocol.handle("media", (request) => {
    const url = request.url.replace("media://", "");
    try {
      const redirectUrl = `http://localhost:${mediaServerPort}/stream?file=${url}`;
      return new Response(null, {
        status: 302,
        headers: {
          "Location": redirectUrl
        }
      });
    } catch (error) {
      console.error("Media protocol error:", error);
      return new Response("Error", { status: 500 });
    }
  });
  createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
app.on("before-quit", () => {
  try {
    const tempDir = app.getPath("temp");
    const entries = fs.readdirSync(tempDir);
    for (const entry of entries) {
      if (/^(chunk_\d+\.flac|gap_heal_\d+.*\.flac|subtitles_gen_audio_\d+\.flac)$/.test(entry)) {
        fs.unlinkSync(path.join(tempDir, entry));
      }
    }
  } catch {
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
if (app.isPackaged) {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  app.whenReady().then(() => {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {
      });
    }, 5e3);
  });
  autoUpdater.on("update-available", (info) => {
    mainWindow?.webContents.send("update-available", {
      version: info.version,
      releaseNotes: info.releaseNotes,
      releaseDate: info.releaseDate
    });
  });
  autoUpdater.on("download-progress", (progress) => {
    mainWindow?.webContents.send("update-download-progress", {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total
    });
  });
  autoUpdater.on("update-downloaded", (info) => {
    mainWindow?.webContents.send("update-downloaded", {
      version: info.version
    });
  });
  autoUpdater.on("error", (err) => {
    mainWindow?.webContents.send("update-error", err.message);
  });
}
const ENC_PREFIX = "enc:";
function encryptApiKeys(settings) {
  if (!safeStorage.isEncryptionAvailable()) return settings;
  const providers = settings.providers;
  if (!providers) return settings;
  const encrypted = { ...settings, providers: { ...providers } };
  for (const name of Object.keys(encrypted.providers)) {
    const provider = { ...encrypted.providers[name] };
    if (typeof provider.apiKey === "string" && provider.apiKey && !provider.apiKey.startsWith(ENC_PREFIX)) {
      provider.apiKey = ENC_PREFIX + safeStorage.encryptString(provider.apiKey).toString("base64");
    }
    encrypted.providers[name] = provider;
  }
  return encrypted;
}
function decryptApiKeys(settings) {
  if (!safeStorage.isEncryptionAvailable()) return settings;
  const providers = settings.providers;
  if (!providers) return settings;
  const decrypted = { ...settings, providers: { ...providers } };
  for (const name of Object.keys(decrypted.providers)) {
    const provider = { ...decrypted.providers[name] };
    if (typeof provider.apiKey === "string" && provider.apiKey.startsWith(ENC_PREFIX)) {
      try {
        const buf = Buffer.from(provider.apiKey.slice(ENC_PREFIX.length), "base64");
        provider.apiKey = safeStorage.decryptString(buf);
      } catch {
      }
    }
    decrypted.providers[name] = provider;
  }
  return decrypted;
}
ipcMain.handle("store:get", (_event, key) => {
  if (typeof key !== "string" || !ALLOWED_STORE_KEYS.includes(key)) {
    throw new Error(`Invalid store key: ${key}`);
  }
  const value = store.get(key);
  if (key === "settings" && value && typeof value === "object") {
    return decryptApiKeys(value);
  }
  return value;
});
ipcMain.handle("store:set", (_event, key, value) => {
  if (typeof key !== "string" || !ALLOWED_STORE_KEYS.includes(key)) {
    throw new Error(`Invalid store key: ${key}`);
  }
  if (key === "settings" && value && typeof value === "object") {
    store.set(key, encryptApiKeys(value));
  } else {
    store.set(key, value);
  }
});
ipcMain.handle("store:delete", (_event, key) => {
  if (typeof key !== "string" || !ALLOWED_STORE_KEYS.includes(key)) {
    throw new Error(`Invalid store key: ${key}`);
  }
  store.delete(key);
});
ipcMain.handle("dialog:openFile", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [
      { name: "Media Files", extensions: ["mp4", "mkv", "avi", "mov", "webm", "mp3", "wav", "aac", "m4a", "ogg", "flac"] }
    ]
  });
  const filePath = result.filePaths[0] || null;
  if (filePath) allowedPaths.add(path.resolve(filePath));
  return filePath;
});
ipcMain.handle("dialog:openSubtitleFile", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [
      { name: "Subtitle Files", extensions: ["srt", "vtt", "ass", "ssa"] }
    ]
  });
  const filePath = result.filePaths[0] || null;
  if (filePath) allowedPaths.add(path.resolve(filePath));
  return filePath;
});
ipcMain.handle("dialog:saveFile", async (_event, defaultName, filterName, filterExtensions) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [{ name: filterName || "Subtitle File", extensions: filterExtensions || [defaultName.split(".").pop() || "srt"] }]
  });
  const filePath = result.filePath || null;
  if (filePath) allowedPaths.add(path.resolve(filePath));
  return filePath;
});
ipcMain.handle("dialog:showMessageBox", async (_event, options) => {
  return dialog.showMessageBox(mainWindow, options);
});
ipcMain.handle("file:read", async (_event, filePath) => {
  const safePath = validatePath(filePath, ...getAllowedDirs());
  return fs.promises.readFile(safePath);
});
ipcMain.handle("file:write", async (_event, filePath, data) => {
  const safePath = validatePath(filePath, ...getAllowedDirs());
  await fs.promises.writeFile(safePath, data, "utf-8");
});
ipcMain.handle("file:getInfo", async (_event, filePath) => {
  const safePath = validatePath(filePath, ...getAllowedDirs());
  const stats = await fs.promises.stat(safePath);
  return {
    size: stats.size,
    path: safePath,
    name: path.basename(safePath),
    ext: path.extname(safePath).toLowerCase()
  };
});
ipcMain.handle("file:getTempPath", () => {
  return app.getPath("temp");
});
const ALLOWED_MEDIA_EXTENSIONS = /* @__PURE__ */ new Set([
  ".mp4",
  ".mkv",
  ".avi",
  ".mov",
  ".webm",
  ".ts",
  ".mts",
  ".m2ts",
  ".mp3",
  ".wav",
  ".m4a",
  ".flac",
  ".ogg",
  ".aac",
  ".wma",
  ".alac",
  ".aiff"
]);
ipcMain.handle("file:registerPath", (_event, filePath) => {
  if (typeof filePath !== "string") return;
  const resolved = path.resolve(filePath);
  const ext = path.extname(resolved).toLowerCase();
  if (!ALLOWED_MEDIA_EXTENSIONS.has(ext)) {
    throw new Error("Only media files can be registered");
  }
  allowedPaths.add(resolved);
});
ipcMain.handle("ffmpeg:extractAudio", async (_event, inputPath, outputPath, format = "flac") => {
  const safeInput = validatePath(inputPath, ...getAllowedDirs());
  const safeOutput = validatePath(outputPath, ...getAllowedDirs());
  const codec = format === "mp3" ? "libmp3lame" : "flac";
  return new Promise((resolve, reject) => {
    ffmpeg(safeInput).audioCodec(codec).toFormat(format).on("end", () => resolve(safeOutput)).on("error", (err) => reject(err.message)).save(safeOutput);
  });
});
ipcMain.handle("ffmpeg:getDuration", async (_event, filePath) => {
  const safePath = validatePath(filePath, ...getAllowedDirs());
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(safePath, (err, data) => {
      if (err) reject(err.message);
      else resolve(data.format.duration || 0);
    });
  });
});
ipcMain.handle("ffmpeg:getVideoInfo", async (_event, filePath) => {
  const safePath = validatePath(filePath, ...getAllowedDirs());
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(safePath, (err, data) => {
      if (err) reject(err.message);
      else {
        const videoStream = data.streams.find((s) => s.codec_type === "video");
        resolve({
          duration: data.format.duration || 0,
          width: videoStream?.width ?? null,
          height: videoStream?.height ?? null
        });
      }
    });
  });
});
ipcMain.handle("ffmpeg:detectSilences", async (_event, filePath, threshold, minDuration) => {
  const safePath = validatePath(filePath, ...getAllowedDirs());
  if (!Number.isFinite(threshold) || threshold < -100 || threshold > 0) {
    throw new Error("Invalid threshold: must be between -100 and 0");
  }
  if (!Number.isFinite(minDuration) || minDuration < 0.1 || minDuration > 60) {
    throw new Error("Invalid minDuration: must be between 0.1 and 60");
  }
  return new Promise((resolve, reject) => {
    const silences = [];
    let currentSilence = null;
    ffmpeg(safePath).audioFilters(`silencedetect=noise=${threshold}dB:d=${minDuration}`).format("null").on("stderr", (line) => {
      const startMatch = line.match(/silence_start:\s*([\d.]+)/);
      if (startMatch) {
        currentSilence = { start: parseFloat(startMatch[1]) };
      }
      const endMatch = line.match(/silence_end:\s*([\d.]+)/);
      if (endMatch && currentSilence) {
        currentSilence.end = parseFloat(endMatch[1]);
        silences.push(currentSilence);
        currentSilence = null;
      }
    }).on("end", () => resolve(silences)).on("error", (err) => reject(err.message)).output(process.platform === "win32" ? "NUL" : "/dev/null").run();
  });
});
ipcMain.handle("ffmpeg:splitAudio", async (_event, inputPath, chunks, format = "flac") => {
  const safeInput = validatePath(inputPath, ...getAllowedDirs());
  const results = [];
  const codec = format === "mp3" ? "libmp3lame" : "flac";
  for (const chunk of chunks) {
    const safeOutput = validatePath(chunk.outputPath, ...getAllowedDirs());
    await new Promise((resolve, reject) => {
      ffmpeg(safeInput).setStartTime(chunk.start).setDuration(chunk.end - chunk.start).audioCodec(codec).toFormat(format).on("end", () => {
        results.push(safeOutput);
        resolve();
      }).on("error", (err) => reject(err.message)).save(safeOutput);
    });
  }
  return results;
});
ipcMain.handle("ffmpeg:burnSubtitles", async (_event, inputPath, subtitleContent, outputPath, targetWidth, targetHeight, subtitleFormat = "ass") => {
  const safeInput = validatePath(inputPath, ...getAllowedDirs());
  const safeOutput = validatePath(outputPath, ...getAllowedDirs());
  const tempDir = app.getPath("temp");
  const tempSrtPath = path.join(tempDir, `sublibr_subs_burn.${subtitleFormat}`);
  await fs.promises.writeFile(tempSrtPath, subtitleContent, "utf-8");
  let escapedSrtPath;
  if (process.platform === "win32") {
    escapedSrtPath = tempSrtPath.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "$1\\:");
  } else {
    escapedSrtPath = tempSrtPath.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
  }
  const videoFilter = targetWidth && targetHeight ? `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:black,subtitles='${escapedSrtPath}'` : `subtitles='${escapedSrtPath}'`;
  return new Promise((resolve, reject) => {
    ffmpeg(safeInput).videoFilters(videoFilter).outputOptions(["-c:a", "copy"]).on("progress", (progress) => {
      mainWindow?.webContents.send("ffmpeg:burnSubtitlesProgress", {
        percent: Math.min(99, Math.round(progress.percent || 0))
      });
    }).on("end", async () => {
      await fs.promises.unlink(tempSrtPath).catch(() => {
      });
      mainWindow?.webContents.send("ffmpeg:burnSubtitlesProgress", { percent: 100 });
      resolve(safeOutput);
    }).on("error", async (err) => {
      await fs.promises.unlink(tempSrtPath).catch(() => {
      });
      reject(err.message);
    }).save(safeOutput);
  });
});
ipcMain.handle("app:getVersion", () => {
  return app.getVersion();
});
ipcMain.handle("app:checkForUpdates", async () => {
  if (!app.isPackaged) return { updateAvailable: false };
  try {
    const result = await autoUpdater.checkForUpdates();
    return { updateAvailable: !!result?.updateInfo };
  } catch {
    return { updateAvailable: false };
  }
});
ipcMain.handle("app:downloadUpdate", async () => {
  if (!app.isPackaged) return;
  await autoUpdater.downloadUpdate();
});
ipcMain.handle("app:installUpdate", () => {
  autoUpdater.quitAndInstall(false, true);
});
ipcMain.handle("ai:testApiKey", async (_event, provider, apiKey) => {
  try {
    switch (provider) {
      case "gemini": {
        const res = await net.fetch(
          "https://generativelanguage.googleapis.com/v1beta/models",
          { headers: { "x-goog-api-key": apiKey } }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          return { ok: false, error: err.error?.message || `HTTP ${res.status}` };
        }
        return { ok: true };
      }
      case "anthropic": {
        const res = await net.fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 1,
            messages: [{ role: "user", content: "ping" }]
          })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          return { ok: false, error: err.error?.message || `HTTP ${res.status}` };
        }
        return { ok: true };
      }
      case "openai": {
        const res = await net.fetch("https://api.openai.com/v1/models", {
          headers: { "Authorization": `Bearer ${apiKey}` }
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          return { ok: false, error: err.error?.message || `HTTP ${res.status}` };
        }
        return { ok: true };
      }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
});
ipcMain.handle("ai:callProvider", async (_event, provider, apiKey, model, prompt, audioBase64, audioFormat = "flac", language, previousTranscript) => {
  const mimeType = `audio/${audioFormat}`;
  switch (provider) {
    case "gemini": {
      const { GoogleGenerativeAI } = await import("./index-B6HwN2S4.js");
      const genAI = new GoogleGenerativeAI(apiKey);
      const geminiModel = genAI.getGenerativeModel({ model });
      const result = await geminiModel.generateContent([
        prompt,
        {
          inlineData: {
            mimeType,
            data: audioBase64
          }
        }
      ]);
      const response = await result.response;
      const usage = response.usageMetadata;
      return {
        text: response.text(),
        tokenUsage: {
          inputTokens: usage?.promptTokenCount ?? 0,
          outputTokens: usage?.candidatesTokenCount ?? 0,
          provider: "gemini",
          model,
          timestamp: Date.now()
        }
      };
    }
    case "openai": {
      const isChatModel = model.startsWith("gpt-4o");
      if (isChatModel) {
        let mappedModel = model;
        if (model === "gpt-4o") {
          mappedModel = "gpt-4o-audio-preview";
        } else if (model === "gpt-4o-mini") {
          mappedModel = "gpt-4o-mini-audio-preview";
        }
        const formatOption = audioFormat === "mp3" ? "mp3" : "wav";
        const messages = [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "input_audio",
                input_audio: {
                  data: audioBase64,
                  format: formatOption
                  // OpenAI supports wav, mp3. 
                }
              }
            ]
          }
        ];
        const res = await net.fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: mappedModel,
            modalities: ["text"],
            // We only want text back
            messages
          })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
          throw new Error(`OpenAI API error: ${err.error?.message || res.statusText}`);
        }
        const data = await res.json();
        const text = data.choices[0]?.message?.content || "";
        return {
          text,
          tokenUsage: {
            inputTokens: data.usage?.prompt_tokens || 0,
            outputTokens: data.usage?.completion_tokens || 0,
            provider: "openai",
            model,
            timestamp: Date.now()
          }
        };
      } else {
        const buffer = Buffer.from(audioBase64, "base64");
        const blob = new Blob([buffer], { type: mimeType });
        const formData = new FormData();
        formData.append("file", blob, `audio.${audioFormat}`);
        formData.append("model", "whisper-1");
        formData.append("response_format", "verbose_json");
        formData.append("timestamp_granularities[]", "word");
        if (language) {
          formData.append("language", language);
        }
        let finalPrompt = WHISPER_PUNCTUATION_PROMPT;
        if (previousTranscript) {
          finalPrompt = `${previousTranscript}

${finalPrompt}`;
        }
        formData.append("prompt", finalPrompt);
        const res = await net.fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`
          },
          body: formData
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
          throw new Error(`OpenAI API error: ${err.error?.message || res.statusText}`);
        }
        const data = await res.json();
        return {
          text: JSON.stringify(data),
          tokenUsage: {
            inputTokens: 0,
            outputTokens: 0,
            provider: "openai",
            model: "whisper-1",
            timestamp: Date.now()
          }
        };
      }
    }
  }
});
ipcMain.handle("ai:callTextProvider", async (_event, provider, apiKey, model, prompt) => {
  switch (provider) {
    case "gemini": {
      const { GoogleGenerativeAI } = await import("./index-B6HwN2S4.js");
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
          provider: "gemini",
          model,
          timestamp: Date.now()
        }
      };
    }
    case "openai": {
      let mappedModel = model;
      if (model === "gpt-4o-audio-preview") mappedModel = "gpt-4o";
      if (model === "gpt-4o-mini-audio-preview") mappedModel = "gpt-4o-mini";
      if (model === "whisper-1") mappedModel = "gpt-4o-mini";
      const messages = [
        {
          role: "user",
          content: prompt
        }
      ];
      const res = await net.fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: mappedModel,
          messages
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
        throw new Error(`OpenAI API error: ${err.error?.message || res.statusText}`);
      }
      const data = await res.json();
      const text = data.choices[0]?.message?.content || "";
      return {
        text,
        tokenUsage: {
          inputTokens: data.usage?.prompt_tokens || 0,
          outputTokens: data.usage?.completion_tokens || 0,
          provider: "openai",
          model,
          timestamp: Date.now()
        }
      };
    }
  }
});
