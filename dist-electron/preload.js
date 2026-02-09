var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// electron/preload.ts
var preload_exports = {};
module.exports = __toCommonJS(preload_exports);
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("electronAPI", {
  // Settings
  getStoreValue: (key) => import_electron.ipcRenderer.invoke("store:get", key),
  setStoreValue: (key, value) => import_electron.ipcRenderer.invoke("store:set", key, value),
  // File dialogs
  openFileDialog: () => import_electron.ipcRenderer.invoke("dialog:openFile"),
  saveFileDialog: (defaultName) => import_electron.ipcRenderer.invoke("dialog:saveFile", defaultName),
  // File operations
  readFile: (path) => import_electron.ipcRenderer.invoke("file:read", path),
  readFileAsDataUrl: (path) => import_electron.ipcRenderer.invoke("file:readAsDataUrl", path),
  writeFile: (path, data) => import_electron.ipcRenderer.invoke("file:write", path, data),
  getFileInfo: (path) => import_electron.ipcRenderer.invoke("file:getInfo", path),
  getTempPath: () => import_electron.ipcRenderer.invoke("file:getTempPath"),
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
