import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("electronAPI", {
  // Settings
  getStoreValue: (key) => ipcRenderer.invoke("store:get", key),
  setStoreValue: (key, value) => ipcRenderer.invoke("store:set", key, value),
  // File dialogs
  openFileDialog: () => ipcRenderer.invoke("dialog:openFile"),
  saveFileDialog: (defaultName) => ipcRenderer.invoke("dialog:saveFile", defaultName),
  // File operations
  readFile: (path) => ipcRenderer.invoke("file:read", path),
  readFileAsDataUrl: (path) => ipcRenderer.invoke("file:readAsDataUrl", path),
  writeFile: (path, data) => ipcRenderer.invoke("file:write", path, data),
  getFileInfo: (path) => ipcRenderer.invoke("file:getInfo", path),
  getTempPath: () => ipcRenderer.invoke("file:getTempPath"),
  // FFmpeg operations
  extractAudio: (inputPath, outputPath) => ipcRenderer.invoke("ffmpeg:extractAudio", inputPath, outputPath),
  getDuration: (filePath) => ipcRenderer.invoke("ffmpeg:getDuration", filePath),
  detectSilences: (filePath, threshold, minDuration) => ipcRenderer.invoke("ffmpeg:detectSilences", filePath, threshold, minDuration),
  splitAudio: (inputPath, chunks) => ipcRenderer.invoke("ffmpeg:splitAudio", inputPath, chunks),
  // Progress events
  onProgress: (callback) => {
    ipcRenderer.on("progress", (_event, progress) => callback(progress));
  }
});
