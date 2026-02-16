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
      // File dialogs
      openFileDialog: () => ipcRenderer.invoke("dialog:openFile"),
      openSubtitleFileDialog: () => ipcRenderer.invoke("dialog:openSubtitleFile"),
      saveFileDialog: (defaultName) => ipcRenderer.invoke("dialog:saveFile", defaultName),
      // File operations
      readFile: (path) => ipcRenderer.invoke("file:read", path),
      readFileAsDataUrl: (path) => ipcRenderer.invoke("file:readAsDataUrl", path),
      writeFile: (path, data) => ipcRenderer.invoke("file:write", path, data),
      getFileInfo: (path) => ipcRenderer.invoke("file:getInfo", path),
      getTempPath: () => ipcRenderer.invoke("file:getTempPath"),
      registerPath: (path) => ipcRenderer.invoke("file:registerPath", path),
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
  }
});
export default require_preload();
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlbG9hZC5janMiLCJzb3VyY2VzIjpbIi4uL2VsZWN0cm9uL3ByZWxvYWQudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgY29udGV4dEJyaWRnZSwgaXBjUmVuZGVyZXIsIHdlYlV0aWxzIH0gZnJvbSAnZWxlY3Ryb24nO1xuXG4vLyBFeHBvc2Ugc2FmZSBBUElzIHRvIHJlbmRlcmVyXG5jb250ZXh0QnJpZGdlLmV4cG9zZUluTWFpbldvcmxkKCdlbGVjdHJvbkFQSScsIHtcbiAgICAvLyBVdGlsc1xuICAgIGdldEZpbGVQYXRoOiAoZmlsZTogRmlsZSkgPT4gd2ViVXRpbHMuZ2V0UGF0aEZvckZpbGUoZmlsZSksXG5cbiAgICAvLyBTZXR0aW5nc1xuICAgIGdldFN0b3JlVmFsdWU6IChrZXk6IHN0cmluZykgPT4gaXBjUmVuZGVyZXIuaW52b2tlKCdzdG9yZTpnZXQnLCBrZXkpLFxuICAgIHNldFN0b3JlVmFsdWU6IChrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24pID0+IGlwY1JlbmRlcmVyLmludm9rZSgnc3RvcmU6c2V0Jywga2V5LCB2YWx1ZSksXG5cbiAgICAvLyBGaWxlIGRpYWxvZ3NcbiAgICBvcGVuRmlsZURpYWxvZzogKCkgPT4gaXBjUmVuZGVyZXIuaW52b2tlKCdkaWFsb2c6b3BlbkZpbGUnKSxcbiAgICBvcGVuU3VidGl0bGVGaWxlRGlhbG9nOiAoKSA9PiBpcGNSZW5kZXJlci5pbnZva2UoJ2RpYWxvZzpvcGVuU3VidGl0bGVGaWxlJyksXG4gICAgc2F2ZUZpbGVEaWFsb2c6IChkZWZhdWx0TmFtZTogc3RyaW5nKSA9PiBpcGNSZW5kZXJlci5pbnZva2UoJ2RpYWxvZzpzYXZlRmlsZScsIGRlZmF1bHROYW1lKSxcblxuICAgIC8vIEZpbGUgb3BlcmF0aW9uc1xuICAgIHJlYWRGaWxlOiAocGF0aDogc3RyaW5nKSA9PiBpcGNSZW5kZXJlci5pbnZva2UoJ2ZpbGU6cmVhZCcsIHBhdGgpLFxuICAgIHJlYWRGaWxlQXNEYXRhVXJsOiAocGF0aDogc3RyaW5nKSA9PiBpcGNSZW5kZXJlci5pbnZva2UoJ2ZpbGU6cmVhZEFzRGF0YVVybCcsIHBhdGgpLFxuICAgIHdyaXRlRmlsZTogKHBhdGg6IHN0cmluZywgZGF0YTogc3RyaW5nKSA9PiBpcGNSZW5kZXJlci5pbnZva2UoJ2ZpbGU6d3JpdGUnLCBwYXRoLCBkYXRhKSxcbiAgICBnZXRGaWxlSW5mbzogKHBhdGg6IHN0cmluZykgPT4gaXBjUmVuZGVyZXIuaW52b2tlKCdmaWxlOmdldEluZm8nLCBwYXRoKSxcbiAgICBnZXRUZW1wUGF0aDogKCkgPT4gaXBjUmVuZGVyZXIuaW52b2tlKCdmaWxlOmdldFRlbXBQYXRoJyksXG4gICAgcmVnaXN0ZXJQYXRoOiAocGF0aDogc3RyaW5nKSA9PiBpcGNSZW5kZXJlci5pbnZva2UoJ2ZpbGU6cmVnaXN0ZXJQYXRoJywgcGF0aCksXG5cbiAgICAvLyBGRm1wZWcgb3BlcmF0aW9uc1xuICAgIGV4dHJhY3RBdWRpbzogKGlucHV0UGF0aDogc3RyaW5nLCBvdXRwdXRQYXRoOiBzdHJpbmcpID0+XG4gICAgICAgIGlwY1JlbmRlcmVyLmludm9rZSgnZmZtcGVnOmV4dHJhY3RBdWRpbycsIGlucHV0UGF0aCwgb3V0cHV0UGF0aCksXG4gICAgZ2V0RHVyYXRpb246IChmaWxlUGF0aDogc3RyaW5nKSA9PlxuICAgICAgICBpcGNSZW5kZXJlci5pbnZva2UoJ2ZmbXBlZzpnZXREdXJhdGlvbicsIGZpbGVQYXRoKSxcbiAgICBkZXRlY3RTaWxlbmNlczogKGZpbGVQYXRoOiBzdHJpbmcsIHRocmVzaG9sZDogbnVtYmVyLCBtaW5EdXJhdGlvbjogbnVtYmVyKSA9PlxuICAgICAgICBpcGNSZW5kZXJlci5pbnZva2UoJ2ZmbXBlZzpkZXRlY3RTaWxlbmNlcycsIGZpbGVQYXRoLCB0aHJlc2hvbGQsIG1pbkR1cmF0aW9uKSxcbiAgICBzcGxpdEF1ZGlvOiAoaW5wdXRQYXRoOiBzdHJpbmcsIGNodW5rczogeyBzdGFydDogbnVtYmVyOyBlbmQ6IG51bWJlcjsgb3V0cHV0UGF0aDogc3RyaW5nIH1bXSkgPT5cbiAgICAgICAgaXBjUmVuZGVyZXIuaW52b2tlKCdmZm1wZWc6c3BsaXRBdWRpbycsIGlucHV0UGF0aCwgY2h1bmtzKSxcblxuICAgIC8vIFByb2dyZXNzIGV2ZW50c1xuICAgIG9uUHJvZ3Jlc3M6IChjYWxsYmFjazogKHByb2dyZXNzOiBudW1iZXIpID0+IHZvaWQpID0+IHtcbiAgICAgICAgaXBjUmVuZGVyZXIub24oJ3Byb2dyZXNzJywgKF9ldmVudCwgcHJvZ3Jlc3MpID0+IGNhbGxiYWNrKHByb2dyZXNzKSk7XG4gICAgfSxcbn0pO1xuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFHQSxrQkFBYyxrQkFBa0IsZUFBZTtBQUFBO0FBQUEsTUFFM0MsYUFBYSxDQUFDLFNBQWUsU0FBUyxlQUFlLElBQUk7QUFBQTtBQUFBLE1BR3pELGVBQWUsQ0FBQyxRQUFnQixZQUFZLE9BQU8sYUFBYSxHQUFHO0FBQUEsTUFDbkUsZUFBZSxDQUFDLEtBQWEsVUFBbUIsWUFBWSxPQUFPLGFBQWEsS0FBSyxLQUFLO0FBQUE7QUFBQSxNQUcxRixnQkFBZ0IsTUFBTSxZQUFZLE9BQU8saUJBQWlCO0FBQUEsTUFDMUQsd0JBQXdCLE1BQU0sWUFBWSxPQUFPLHlCQUF5QjtBQUFBLE1BQzFFLGdCQUFnQixDQUFDLGdCQUF3QixZQUFZLE9BQU8sbUJBQW1CLFdBQVc7QUFBQTtBQUFBLE1BRzFGLFVBQVUsQ0FBQyxTQUFpQixZQUFZLE9BQU8sYUFBYSxJQUFJO0FBQUEsTUFDaEUsbUJBQW1CLENBQUMsU0FBaUIsWUFBWSxPQUFPLHNCQUFzQixJQUFJO0FBQUEsTUFDbEYsV0FBVyxDQUFDLE1BQWMsU0FBaUIsWUFBWSxPQUFPLGNBQWMsTUFBTSxJQUFJO0FBQUEsTUFDdEYsYUFBYSxDQUFDLFNBQWlCLFlBQVksT0FBTyxnQkFBZ0IsSUFBSTtBQUFBLE1BQ3RFLGFBQWEsTUFBTSxZQUFZLE9BQU8sa0JBQWtCO0FBQUEsTUFDeEQsY0FBYyxDQUFDLFNBQWlCLFlBQVksT0FBTyxxQkFBcUIsSUFBSTtBQUFBO0FBQUEsTUFHNUUsY0FBYyxDQUFDLFdBQW1CLGVBQzlCLFlBQVksT0FBTyx1QkFBdUIsV0FBVyxVQUFVO0FBQUEsTUFDbkUsYUFBYSxDQUFDLGFBQ1YsWUFBWSxPQUFPLHNCQUFzQixRQUFRO0FBQUEsTUFDckQsZ0JBQWdCLENBQUMsVUFBa0IsV0FBbUIsZ0JBQ2xELFlBQVksT0FBTyx5QkFBeUIsVUFBVSxXQUFXLFdBQVc7QUFBQSxNQUNoRixZQUFZLENBQUMsV0FBbUIsV0FDNUIsWUFBWSxPQUFPLHFCQUFxQixXQUFXLE1BQU07QUFBQTtBQUFBLE1BRzdELFlBQVksQ0FBQyxhQUF5QztBQUNsRCxvQkFBWSxHQUFHLFlBQVksQ0FBQyxRQUFRLGFBQWEsU0FBUyxRQUFRLENBQUM7QUFBQSxNQUN2RTtBQUFBLElBQ0osQ0FBQztBQUFBO0FBQUE7In0=
