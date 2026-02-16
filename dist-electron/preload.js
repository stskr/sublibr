// electron/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("electronAPI", {
  // Utils
  getFilePath: (file) => import_electron.webUtils.getPathForFile(file),
  // Settings
  getStoreValue: (key) => import_electron.ipcRenderer.invoke("store:get", key),
  setStoreValue: (key, value) => import_electron.ipcRenderer.invoke("store:set", key, value),
  // File dialogs
  openFileDialog: () => import_electron.ipcRenderer.invoke("dialog:openFile"),
  openSubtitleFileDialog: () => import_electron.ipcRenderer.invoke("dialog:openSubtitleFile"),
  saveFileDialog: (defaultName) => import_electron.ipcRenderer.invoke("dialog:saveFile", defaultName),
  // File operations
  readFile: (path) => import_electron.ipcRenderer.invoke("file:read", path),
  readFileAsDataUrl: (path) => import_electron.ipcRenderer.invoke("file:readAsDataUrl", path),
  writeFile: (path, data) => import_electron.ipcRenderer.invoke("file:write", path, data),
  getFileInfo: (path) => import_electron.ipcRenderer.invoke("file:getInfo", path),
  getTempPath: () => import_electron.ipcRenderer.invoke("file:getTempPath"),
  registerPath: (path) => import_electron.ipcRenderer.invoke("file:registerPath", path),
  // FFmpeg operations
  extractAudio: (inputPath, outputPath) => import_electron.ipcRenderer.invoke("ffmpeg:extractAudio", inputPath, outputPath),
  getDuration: (filePath) => import_electron.ipcRenderer.invoke("ffmpeg:getDuration", filePath),
  detectSilences: (filePath, threshold, minDuration) => import_electron.ipcRenderer.invoke("ffmpeg:detectSilences", filePath, threshold, minDuration),
  splitAudio: (inputPath, chunks) => import_electron.ipcRenderer.invoke("ffmpeg:splitAudio", inputPath, chunks),
  // Progress events
  onProgress: (callback) => {
    import_electron.ipcRenderer.on("progress", (_event, progress) => callback(progress));
  }
});
