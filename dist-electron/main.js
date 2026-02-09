import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import Store from "electron-store";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import ffprobePath from "@ffprobe-installer/ffprobe";
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
ffmpeg.setFfmpegPath(ffmpegPath.path);
ffmpeg.setFfprobePath(ffprobePath.path);
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
      sandbox: false
      // Required for ESM preload scripts
    },
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0a0a0f"
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname$1, "../dist/index.html"));
  }
}
app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
ipcMain.handle("store:get", (_event, key) => {
  return store.get(key);
});
ipcMain.handle("store:set", (_event, key, value) => {
  store.set(key, value);
});
ipcMain.handle("dialog:openFile", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [
      { name: "Media Files", extensions: ["mp4", "mkv", "avi", "mov", "webm", "mp3", "wav", "aac", "m4a", "ogg", "flac"] }
    ]
  });
  return result.filePaths[0] || null;
});
ipcMain.handle("dialog:saveFile", async (_event, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [{ name: "SRT Subtitle", extensions: ["srt"] }]
  });
  return result.filePath || null;
});
ipcMain.handle("file:read", async (_event, filePath) => {
  return fs.promises.readFile(filePath);
});
ipcMain.handle("file:readAsDataUrl", async (_event, filePath) => {
  const data = await fs.promises.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase().slice(1);
  const mimeTypes = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    flac: "audio/flac",
    mp4: "video/mp4",
    webm: "video/webm",
    mkv: "video/x-matroska",
    mov: "video/quicktime",
    avi: "video/x-msvideo"
  };
  const mimeType = mimeTypes[ext] || "application/octet-stream";
  return `data:${mimeType};base64,${data.toString("base64")}`;
});
ipcMain.handle("file:write", async (_event, filePath, data) => {
  await fs.promises.writeFile(filePath, data, "utf-8");
});
ipcMain.handle("file:getInfo", async (_event, filePath) => {
  const stats = await fs.promises.stat(filePath);
  return {
    size: stats.size,
    path: filePath,
    name: path.basename(filePath),
    ext: path.extname(filePath).toLowerCase()
  };
});
ipcMain.handle("file:getTempPath", () => {
  return app.getPath("temp");
});
ipcMain.handle("ffmpeg:extractAudio", async (_event, inputPath, outputPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath).audioCodec("libmp3lame").audioBitrate(128).toFormat("mp3").on("end", () => resolve(outputPath)).on("error", (err) => reject(err.message)).save(outputPath);
  });
});
ipcMain.handle("ffmpeg:getDuration", async (_event, filePath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) reject(err.message);
      else resolve(data.format.duration || 0);
    });
  });
});
ipcMain.handle("ffmpeg:detectSilences", async (_event, filePath, threshold, minDuration) => {
  return new Promise((resolve, reject) => {
    const silences = [];
    let currentSilence = null;
    ffmpeg(filePath).audioFilters(`silencedetect=noise=${threshold}dB:d=${minDuration}`).format("null").on("stderr", (line) => {
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
    }).on("end", () => resolve(silences)).on("error", (err) => reject(err.message)).output("/dev/null").run();
  });
});
ipcMain.handle("ffmpeg:splitAudio", async (_event, inputPath, chunks) => {
  const results = [];
  for (const chunk of chunks) {
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath).setStartTime(chunk.start).setDuration(chunk.end - chunk.start).audioCodec("libmp3lame").audioBitrate(128).toFormat("mp3").on("end", () => {
        results.push(chunk.outputPath);
        resolve();
      }).on("error", (err) => reject(err.message)).save(chunk.outputPath);
    });
  }
  return results;
});
