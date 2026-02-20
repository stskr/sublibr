var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
import { contextBridge, ipcRenderer, webUtils } from "electron";
var require_preload = __commonJS({
  "preload.cjs"() {
    contextBridge.exposeInMainWorld("electronAPI", {
      // Utils
      getFilePath: (file) => webUtils.getPathForFile(file),
      // Settings
      getStoreValue: (key) => ipcRenderer.invoke("store:get", key),
      setStoreValue: (key, value) => ipcRenderer.invoke("store:set", key, value),
      deleteStoreValue: (key) => ipcRenderer.invoke("store:delete", key),
      // File dialogs
      openFileDialog: () => ipcRenderer.invoke("dialog:openFile"),
      openSubtitleFileDialog: () => ipcRenderer.invoke("dialog:openSubtitleFile"),
      saveFileDialog: (defaultName, filterName, filterExtensions) => ipcRenderer.invoke("dialog:saveFile", defaultName, filterName, filterExtensions),
      showMessageBox: (options) => ipcRenderer.invoke("dialog:showMessageBox", options),
      // File operations
      readFile: (path) => ipcRenderer.invoke("file:read", path),
      writeFile: (path, data) => ipcRenderer.invoke("file:write", path, data),
      getFileInfo: (path) => ipcRenderer.invoke("file:getInfo", path),
      getTempPath: () => ipcRenderer.invoke("file:getTempPath"),
      registerPath: (path) => ipcRenderer.invoke("file:registerPath", path),
      // AI API proxy (calls go through main process — keys never exposed in renderer)
      testApiKey: (provider, apiKey) => ipcRenderer.invoke("ai:testApiKey", provider, apiKey),
      callProvider: (provider, apiKey, model, prompt, audioBase64, audioFormat) => ipcRenderer.invoke("ai:callProvider", provider, apiKey, model, prompt, audioBase64, audioFormat),
      callTextProvider: (provider, apiKey, model, prompt) => ipcRenderer.invoke("ai:callTextProvider", provider, apiKey, model, prompt),
      // FFmpeg operations
      extractAudio: (inputPath, outputPath, format) => ipcRenderer.invoke("ffmpeg:extractAudio", inputPath, outputPath, format),
      getDuration: (filePath) => ipcRenderer.invoke("ffmpeg:getDuration", filePath),
      detectSilences: (filePath, threshold, minDuration) => ipcRenderer.invoke("ffmpeg:detectSilences", filePath, threshold, minDuration),
      splitAudio: (inputPath, chunks, format) => ipcRenderer.invoke("ffmpeg:splitAudio", inputPath, chunks, format),
      // App updates
      getVersion: () => ipcRenderer.invoke("app:getVersion"),
      checkForUpdates: () => ipcRenderer.invoke("app:checkForUpdates"),
      downloadUpdate: () => ipcRenderer.invoke("app:downloadUpdate"),
      installUpdate: () => ipcRenderer.invoke("app:installUpdate"),
      onUpdateAvailable: (callback) => {
        const listener = (_event, info) => callback(info);
        ipcRenderer.on("update-available", listener);
        return () => {
          ipcRenderer.removeListener("update-available", listener);
        };
      },
      onUpdateProgress: (callback) => {
        const listener = (_event, progress) => callback(progress);
        ipcRenderer.on("update-download-progress", listener);
        return () => {
          ipcRenderer.removeListener("update-download-progress", listener);
        };
      },
      onUpdateDownloaded: (callback) => {
        const listener = (_event, info) => callback(info);
        ipcRenderer.on("update-downloaded", listener);
        return () => {
          ipcRenderer.removeListener("update-downloaded", listener);
        };
      },
      onUpdateError: (callback) => {
        const listener = (_event, message) => callback(message);
        ipcRenderer.on("update-error", listener);
        return () => {
          ipcRenderer.removeListener("update-error", listener);
        };
      }
    });
  }
});
export default require_preload();
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlbG9hZC5janMiLCJzb3VyY2VzIjpbIi4uL2VsZWN0cm9uL3ByZWxvYWQudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgY29udGV4dEJyaWRnZSwgaXBjUmVuZGVyZXIsIHdlYlV0aWxzIH0gZnJvbSAnZWxlY3Ryb24nO1xuXG4vLyBFeHBvc2Ugc2FmZSBBUElzIHRvIHJlbmRlcmVyXG5jb250ZXh0QnJpZGdlLmV4cG9zZUluTWFpbldvcmxkKCdlbGVjdHJvbkFQSScsIHtcbiAgICAvLyBVdGlsc1xuICAgIGdldEZpbGVQYXRoOiAoZmlsZTogRmlsZSkgPT4gd2ViVXRpbHMuZ2V0UGF0aEZvckZpbGUoZmlsZSksXG5cbiAgICAvLyBTZXR0aW5nc1xuICAgIGdldFN0b3JlVmFsdWU6IChrZXk6IHN0cmluZykgPT4gaXBjUmVuZGVyZXIuaW52b2tlKCdzdG9yZTpnZXQnLCBrZXkpLFxuICAgIHNldFN0b3JlVmFsdWU6IChrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24pID0+IGlwY1JlbmRlcmVyLmludm9rZSgnc3RvcmU6c2V0Jywga2V5LCB2YWx1ZSksXG4gICAgZGVsZXRlU3RvcmVWYWx1ZTogKGtleTogc3RyaW5nKSA9PiBpcGNSZW5kZXJlci5pbnZva2UoJ3N0b3JlOmRlbGV0ZScsIGtleSksXG5cbiAgICAvLyBGaWxlIGRpYWxvZ3NcbiAgICBvcGVuRmlsZURpYWxvZzogKCkgPT4gaXBjUmVuZGVyZXIuaW52b2tlKCdkaWFsb2c6b3BlbkZpbGUnKSxcbiAgICBvcGVuU3VidGl0bGVGaWxlRGlhbG9nOiAoKSA9PiBpcGNSZW5kZXJlci5pbnZva2UoJ2RpYWxvZzpvcGVuU3VidGl0bGVGaWxlJyksXG4gICAgc2F2ZUZpbGVEaWFsb2c6IChkZWZhdWx0TmFtZTogc3RyaW5nLCBmaWx0ZXJOYW1lPzogc3RyaW5nLCBmaWx0ZXJFeHRlbnNpb25zPzogc3RyaW5nW10pID0+IGlwY1JlbmRlcmVyLmludm9rZSgnZGlhbG9nOnNhdmVGaWxlJywgZGVmYXVsdE5hbWUsIGZpbHRlck5hbWUsIGZpbHRlckV4dGVuc2lvbnMpLFxuICAgIHNob3dNZXNzYWdlQm94OiAob3B0aW9uczogRWxlY3Ryb24uTWVzc2FnZUJveE9wdGlvbnMpID0+IGlwY1JlbmRlcmVyLmludm9rZSgnZGlhbG9nOnNob3dNZXNzYWdlQm94Jywgb3B0aW9ucyksXG5cbiAgICAvLyBGaWxlIG9wZXJhdGlvbnNcbiAgICByZWFkRmlsZTogKHBhdGg6IHN0cmluZykgPT4gaXBjUmVuZGVyZXIuaW52b2tlKCdmaWxlOnJlYWQnLCBwYXRoKSxcblxuICAgIHdyaXRlRmlsZTogKHBhdGg6IHN0cmluZywgZGF0YTogc3RyaW5nKSA9PiBpcGNSZW5kZXJlci5pbnZva2UoJ2ZpbGU6d3JpdGUnLCBwYXRoLCBkYXRhKSxcbiAgICBnZXRGaWxlSW5mbzogKHBhdGg6IHN0cmluZykgPT4gaXBjUmVuZGVyZXIuaW52b2tlKCdmaWxlOmdldEluZm8nLCBwYXRoKSxcbiAgICBnZXRUZW1wUGF0aDogKCkgPT4gaXBjUmVuZGVyZXIuaW52b2tlKCdmaWxlOmdldFRlbXBQYXRoJyksXG4gICAgcmVnaXN0ZXJQYXRoOiAocGF0aDogc3RyaW5nKSA9PiBpcGNSZW5kZXJlci5pbnZva2UoJ2ZpbGU6cmVnaXN0ZXJQYXRoJywgcGF0aCksXG5cbiAgICAvLyBBSSBBUEkgcHJveHkgKGNhbGxzIGdvIHRocm91Z2ggbWFpbiBwcm9jZXNzIOKAlCBrZXlzIG5ldmVyIGV4cG9zZWQgaW4gcmVuZGVyZXIpXG4gICAgdGVzdEFwaUtleTogKHByb3ZpZGVyOiBzdHJpbmcsIGFwaUtleTogc3RyaW5nKSA9PiBpcGNSZW5kZXJlci5pbnZva2UoJ2FpOnRlc3RBcGlLZXknLCBwcm92aWRlciwgYXBpS2V5KSxcbiAgICBjYWxsUHJvdmlkZXI6IChwcm92aWRlcjogc3RyaW5nLCBhcGlLZXk6IHN0cmluZywgbW9kZWw6IHN0cmluZywgcHJvbXB0OiBzdHJpbmcsIGF1ZGlvQmFzZTY0OiBzdHJpbmcsIGF1ZGlvRm9ybWF0Pzogc3RyaW5nKSA9PlxuICAgICAgICBpcGNSZW5kZXJlci5pbnZva2UoJ2FpOmNhbGxQcm92aWRlcicsIHByb3ZpZGVyLCBhcGlLZXksIG1vZGVsLCBwcm9tcHQsIGF1ZGlvQmFzZTY0LCBhdWRpb0Zvcm1hdCksXG4gICAgY2FsbFRleHRQcm92aWRlcjogKHByb3ZpZGVyOiBzdHJpbmcsIGFwaUtleTogc3RyaW5nLCBtb2RlbDogc3RyaW5nLCBwcm9tcHQ6IHN0cmluZykgPT5cbiAgICAgICAgaXBjUmVuZGVyZXIuaW52b2tlKCdhaTpjYWxsVGV4dFByb3ZpZGVyJywgcHJvdmlkZXIsIGFwaUtleSwgbW9kZWwsIHByb21wdCksXG5cbiAgICAvLyBGRm1wZWcgb3BlcmF0aW9uc1xuICAgIGV4dHJhY3RBdWRpbzogKGlucHV0UGF0aDogc3RyaW5nLCBvdXRwdXRQYXRoOiBzdHJpbmcsIGZvcm1hdD86IHN0cmluZykgPT4gaXBjUmVuZGVyZXIuaW52b2tlKCdmZm1wZWc6ZXh0cmFjdEF1ZGlvJywgaW5wdXRQYXRoLCBvdXRwdXRQYXRoLCBmb3JtYXQpLFxuICAgIGdldER1cmF0aW9uOiAoZmlsZVBhdGg6IHN0cmluZykgPT4gaXBjUmVuZGVyZXIuaW52b2tlKCdmZm1wZWc6Z2V0RHVyYXRpb24nLCBmaWxlUGF0aCksXG4gICAgZGV0ZWN0U2lsZW5jZXM6IChmaWxlUGF0aDogc3RyaW5nLCB0aHJlc2hvbGQ6IG51bWJlciwgbWluRHVyYXRpb246IG51bWJlcikgPT4gaXBjUmVuZGVyZXIuaW52b2tlKCdmZm1wZWc6ZGV0ZWN0U2lsZW5jZXMnLCBmaWxlUGF0aCwgdGhyZXNob2xkLCBtaW5EdXJhdGlvbiksXG4gICAgc3BsaXRBdWRpbzogKGlucHV0UGF0aDogc3RyaW5nLCBjaHVua3M6IHsgc3RhcnQ6IG51bWJlcjsgZW5kOiBudW1iZXI7IG91dHB1dFBhdGg6IHN0cmluZyB9W10sIGZvcm1hdD86IHN0cmluZykgPT4gaXBjUmVuZGVyZXIuaW52b2tlKCdmZm1wZWc6c3BsaXRBdWRpbycsIGlucHV0UGF0aCwgY2h1bmtzLCBmb3JtYXQpLFxuXG4gICAgLy8gQXBwIHVwZGF0ZXNcbiAgICBnZXRWZXJzaW9uOiAoKSA9PiBpcGNSZW5kZXJlci5pbnZva2UoJ2FwcDpnZXRWZXJzaW9uJyksXG4gICAgY2hlY2tGb3JVcGRhdGVzOiAoKSA9PiBpcGNSZW5kZXJlci5pbnZva2UoJ2FwcDpjaGVja0ZvclVwZGF0ZXMnKSxcbiAgICBkb3dubG9hZFVwZGF0ZTogKCkgPT4gaXBjUmVuZGVyZXIuaW52b2tlKCdhcHA6ZG93bmxvYWRVcGRhdGUnKSxcbiAgICBpbnN0YWxsVXBkYXRlOiAoKSA9PiBpcGNSZW5kZXJlci5pbnZva2UoJ2FwcDppbnN0YWxsVXBkYXRlJyksXG4gICAgb25VcGRhdGVBdmFpbGFibGU6IChjYWxsYmFjazogKGluZm86IHsgdmVyc2lvbjogc3RyaW5nOyByZWxlYXNlTm90ZXM/OiBzdHJpbmc7IHJlbGVhc2VEYXRlPzogc3RyaW5nIH0pID0+IHZvaWQpID0+IHtcbiAgICAgICAgY29uc3QgbGlzdGVuZXIgPSAoX2V2ZW50OiBFbGVjdHJvbi5JcGNSZW5kZXJlckV2ZW50LCBpbmZvOiB7IHZlcnNpb246IHN0cmluZzsgcmVsZWFzZU5vdGVzPzogc3RyaW5nOyByZWxlYXNlRGF0ZT86IHN0cmluZyB9KSA9PiBjYWxsYmFjayhpbmZvKTtcbiAgICAgICAgaXBjUmVuZGVyZXIub24oJ3VwZGF0ZS1hdmFpbGFibGUnLCBsaXN0ZW5lcik7XG4gICAgICAgIHJldHVybiAoKSA9PiB7IGlwY1JlbmRlcmVyLnJlbW92ZUxpc3RlbmVyKCd1cGRhdGUtYXZhaWxhYmxlJywgbGlzdGVuZXIpOyB9O1xuICAgIH0sXG4gICAgb25VcGRhdGVQcm9ncmVzczogKGNhbGxiYWNrOiAocHJvZ3Jlc3M6IHsgcGVyY2VudDogbnVtYmVyOyB0cmFuc2ZlcnJlZDogbnVtYmVyOyB0b3RhbDogbnVtYmVyIH0pID0+IHZvaWQpID0+IHtcbiAgICAgICAgY29uc3QgbGlzdGVuZXIgPSAoX2V2ZW50OiBFbGVjdHJvbi5JcGNSZW5kZXJlckV2ZW50LCBwcm9ncmVzczogeyBwZXJjZW50OiBudW1iZXI7IHRyYW5zZmVycmVkOiBudW1iZXI7IHRvdGFsOiBudW1iZXIgfSkgPT4gY2FsbGJhY2socHJvZ3Jlc3MpO1xuICAgICAgICBpcGNSZW5kZXJlci5vbigndXBkYXRlLWRvd25sb2FkLXByb2dyZXNzJywgbGlzdGVuZXIpO1xuICAgICAgICByZXR1cm4gKCkgPT4geyBpcGNSZW5kZXJlci5yZW1vdmVMaXN0ZW5lcigndXBkYXRlLWRvd25sb2FkLXByb2dyZXNzJywgbGlzdGVuZXIpOyB9O1xuICAgIH0sXG4gICAgb25VcGRhdGVEb3dubG9hZGVkOiAoY2FsbGJhY2s6IChpbmZvOiB7IHZlcnNpb246IHN0cmluZyB9KSA9PiB2b2lkKSA9PiB7XG4gICAgICAgIGNvbnN0IGxpc3RlbmVyID0gKF9ldmVudDogRWxlY3Ryb24uSXBjUmVuZGVyZXJFdmVudCwgaW5mbzogeyB2ZXJzaW9uOiBzdHJpbmcgfSkgPT4gY2FsbGJhY2soaW5mbyk7XG4gICAgICAgIGlwY1JlbmRlcmVyLm9uKCd1cGRhdGUtZG93bmxvYWRlZCcsIGxpc3RlbmVyKTtcbiAgICAgICAgcmV0dXJuICgpID0+IHsgaXBjUmVuZGVyZXIucmVtb3ZlTGlzdGVuZXIoJ3VwZGF0ZS1kb3dubG9hZGVkJywgbGlzdGVuZXIpOyB9O1xuICAgIH0sXG4gICAgb25VcGRhdGVFcnJvcjogKGNhbGxiYWNrOiAobWVzc2FnZTogc3RyaW5nKSA9PiB2b2lkKSA9PiB7XG4gICAgICAgIGNvbnN0IGxpc3RlbmVyID0gKF9ldmVudDogRWxlY3Ryb24uSXBjUmVuZGVyZXJFdmVudCwgbWVzc2FnZTogc3RyaW5nKSA9PiBjYWxsYmFjayhtZXNzYWdlKTtcbiAgICAgICAgaXBjUmVuZGVyZXIub24oJ3VwZGF0ZS1lcnJvcicsIGxpc3RlbmVyKTtcbiAgICAgICAgcmV0dXJuICgpID0+IHsgaXBjUmVuZGVyZXIucmVtb3ZlTGlzdGVuZXIoJ3VwZGF0ZS1lcnJvcicsIGxpc3RlbmVyKTsgfTtcbiAgICB9LFxu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
