// electron/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("electronAPI", {
  // Utils
  getFilePath: (file) => import_electron.webUtils.getPathForFile(file),
  // Settings
  getStoreValue: (key) => import_electron.ipcRenderer.invoke("store:get", key),
  setStoreValue: (key, value) => import_electron.ipcRenderer.invoke("store:set", key, value),
  deleteStoreValue: (key) => import_electron.ipcRenderer.invoke("store:delete", key),
  // File dialogs
  openFileDialog: () => import_electron.ipcRenderer.invoke("dialog:openFile"),
  openSubtitleFileDialog: () => import_electron.ipcRenderer.invoke("dialog:openSubtitleFile"),
  saveFileDialog: (defaultName, filterName, filterExtensions) => import_electron.ipcRenderer.invoke("dialog:saveFile", defaultName, filterName, filterExtensions),
  showMessageBox: (options) => import_electron.ipcRenderer.invoke("dialog:showMessageBox", options),
  // File operations
  readFile: (path) => import_electron.ipcRenderer.invoke("file:read", path),
  writeFile: (path, data) => import_electron.ipcRenderer.invoke("file:write", path, data),
  getFileInfo: (path) => import_electron.ipcRenderer.invoke("file:getInfo", path),
  getTempPath: () => import_electron.ipcRenderer.invoke("file:getTempPath"),
  registerPath: (path) => import_electron.ipcRenderer.invoke("file:registerPath", path),
  // AI API proxy (calls go through main process — keys never exposed in renderer)
  testApiKey: (provider, apiKey) => import_electron.ipcRenderer.invoke("ai:testApiKey", provider, apiKey),
  callProvider: (provider, apiKey, model, prompt, audioBase64, audioFormat) => import_electron.ipcRenderer.invoke("ai:callProvider", provider, apiKey, model, prompt, audioBase64, audioFormat),
  callTextProvider: (provider, apiKey, model, prompt) => import_electron.ipcRenderer.invoke("ai:callTextProvider", provider, apiKey, model, prompt),
  // FFmpeg operations
  extractAudio: (inputPath, outputPath, format) => import_electron.ipcRenderer.invoke("ffmpeg:extractAudio", inputPath, outputPath, format),
  getDuration: (filePath) => import_electron.ipcRenderer.invoke("ffmpeg:getDuration", filePath),
  detectSilences: (filePath, threshold, minDuration) => import_electron.ipcRenderer.invoke("ffmpeg:detectSilences", filePath, threshold, minDuration),
  splitAudio: (inputPath, chunks, format) => import_electron.ipcRenderer.invoke("ffmpeg:splitAudio", inputPath, chunks, format),
  // App updates
  getVersion: () => import_electron.ipcRenderer.invoke("app:getVersion"),
  checkForUpdates: () => import_electron.ipcRenderer.invoke("app:checkForUpdates"),
  downloadUpdate: () => import_electron.ipcRenderer.invoke("app:downloadUpdate"),
  installUpdate: () => import_electron.ipcRenderer.invoke("app:installUpdate"),
  onUpdateAvailable: (callback) => {
    const listener = (_event, info) => callback(info);
    import_electron.ipcRenderer.on("update-available", listener);
    return () => {
      import_electron.ipcRenderer.removeListener("update-available", listener);
    };
  },
  onUpdateProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    import_electron.ipcRenderer.on("update-download-progress", listener);
    return () => {
      import_electron.ipcRenderer.removeListener("update-download-progress", listener);
    };
  },
  onUpdateDownloaded: (callback) => {
    const listener = (_event, info) => callback(info);
    import_electron.ipcRenderer.on("update-downloaded", listener);
    return () => {
      import_electron.ipcRenderer.removeListener("update-downloaded", listener);
    };
  },
  onUpdateError: (callback) => {
    const listener = (_event, message) => callback(message);
    import_electron.ipcRenderer.on("update-error", listener);
    return () => {
      import_electron.ipcRenderer.removeListener("update-error", listener);
    };
  }
});
