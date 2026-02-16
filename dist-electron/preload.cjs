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
      showMessageBox: (options) => ipcRenderer.invoke("dialog:showMessageBox", options),
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlbG9hZC5janMiLCJzb3VyY2VzIjpbIi4uL2VsZWN0cm9uL3ByZWxvYWQudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgY29udGV4dEJyaWRnZSwgaXBjUmVuZGVyZXIsIHdlYlV0aWxzIH0gZnJvbSAnZWxlY3Ryb24nO1xuXG4vLyBFeHBvc2Ugc2FmZSBBUElzIHRvIHJlbmRlcmVyXG5jb250ZXh0QnJpZGdlLmV4cG9zZUluTWFpbldvcmxkKCdlbGVjdHJvbkFQSScsIHtcbiAgICAvLyBVdGlsc1xuICAgIGdldEZpbGVQYXRoOiAoZmlsZTogRmlsZSkgPT4gd2ViVXRpbHMuZ2V0UGF0aEZvckZpbGUoZmlsZSksXG5cbiAgICAvLyBTZXR0aW5nc1xuICAgIGdldFN0b3JlVmFsdWU6IChrZXk6IHN0cmluZykgPT4gaXBjUmVuZGVyZXIuaW52b2tlKCdzdG9yZTpnZXQnLCBrZXkpLFxuICAgIHNldFN0b3JlVmFsdWU6IChrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24pID0+IGlwY1JlbmRlcmVyLmludm9rZSgnc3RvcmU6c2V0Jywga2V5LCB2YWx1ZSksXG5cbiAgICAvLyBGaWxlIGRpYWxvZ3NcbiAgICBvcGVuRmlsZURpYWxvZzogKCkgPT4gaXBjUmVuZGVyZXIuaW52b2tlKCdkaWFsb2c6b3BlbkZpbGUnKSxcbiAgICBvcGVuU3VidGl0bGVGaWxlRGlhbG9nOiAoKSA9PiBpcGNSZW5kZXJlci5pbnZva2UoJ2RpYWxvZzpvcGVuU3VidGl0bGVGaWxlJyksXG4gICAgc2F2ZUZpbGVEaWFsb2c6IChkZWZhdWx0TmFtZTogc3RyaW5nKSA9PiBpcGNSZW5kZXJlci5pbnZva2UoJ2RpYWxvZzpzYXZlRmlsZScsIGRlZmF1bHROYW1lKSxcbiAgICBzaG93TWVzc2FnZUJveDogKG9wdGlvbnM6IEVsZWN0cm9uLk1lc3NhZ2VCb3hPcHRpb25zKSA9PiBpcGNSZW5kZXJlci5pbnZva2UoJ2RpYWxvZzpzaG93TWVzc2FnZUJveCcsIG9wdGlvbnMpLFxuXG4gICAgLy8gRmlsZSBvcGVyYXRpb25zXG4gICAgcmVhZEZpbGU6IChwYXRoOiBzdHJpbmcpID0+IGlwY1JlbmRlcmVyLmludm9rZSgnZmlsZTpyZWFkJywgcGF0aCksXG4gICAgcmVhZEZpbGVBc0RhdGFVcmw6IChwYXRoOiBzdHJpbmcpID0+IGlwY1JlbmRlcmVyLmludm9rZSgnZmlsZTpyZWFkQXNEYXRhVXJsJywgcGF0aCksXG4gICAgd3JpdGVGaWxlOiAocGF0aDogc3RyaW5nLCBkYXRhOiBzdHJpbmcpID0+IGlwY1JlbmRlcmVyLmludm9rZSgnZmlsZTp3cml0ZScsIHBhdGgsIGRhdGEpLFxuICAgIGdldEZpbGVJbmZvOiAocGF0aDogc3RyaW5nKSA9PiBpcGNSZW5kZXJlci5pbnZva2UoJ2ZpbGU6Z2V0SW5mbycsIHBhdGgpLFxuICAgIGdldFRlbXBQYXRoOiAoKSA9PiBpcGNSZW5kZXJlci5pbnZva2UoJ2ZpbGU6Z2V0VGVtcFBhdGgnKSxcbiAgICByZWdpc3RlclBhdGg6IChwYXRoOiBzdHJpbmcpID0+IGlwY1JlbmRlcmVyLmludm9rZSgnZmlsZTpyZWdpc3RlclBhdGgnLCBwYXRoKSxcblxuICAgIC8vIEZGbXBlZyBvcGVyYXRpb25zXG4gICAgZXh0cmFjdEF1ZGlvOiAoaW5wdXRQYXRoOiBzdHJpbmcsIG91dHB1dFBhdGg6IHN0cmluZykgPT5cbiAgICAgICAgaXBjUmVuZGVyZXIuaW52b2tlKCdmZm1wZWc6ZXh0cmFjdEF1ZGlvJywgaW5wdXRQYXRoLCBvdXRwdXRQYXRoKSxcbiAgICBnZXREdXJhdGlvbjogKGZpbGVQYXRoOiBzdHJpbmcpID0+XG4gICAgICAgIGlwY1JlbmRlcmVyLmludm9rZSgnZmZtcGVnOmdldER1cmF0aW9uJywgZmlsZVBhdGgpLFxuICAgIGRldGVjdFNpbGVuY2VzOiAoZmlsZVBhdGg6IHN0cmluZywgdGhyZXNob2xkOiBudW1iZXIsIG1pbkR1cmF0aW9uOiBudW1iZXIpID0+XG4gICAgICAgIGlwY1JlbmRlcmVyLmludm9rZSgnZmZtcGVnOmRldGVjdFNpbGVuY2VzJywgZmlsZVBhdGgsIHRocmVzaG9sZCwgbWluRHVyYXRpb24pLFxuICAgIHNwbGl0QXVkaW86IChpbnB1dFBhdGg6IHN0cmluZywgY2h1bmtzOiB7IHN0YXJ0OiBudW1iZXI7IGVuZDogbnVtYmVyOyBvdXRwdXRQYXRoOiBzdHJpbmcgfVtdKSA9PlxuICAgICAgICBpcGNSZW5kZXJlci5pbnZva2UoJ2ZmbXBlZzpzcGxpdEF1ZGlvJywgaW5wdXRQYXRoLCBjaHVua3MpLFxuXG4gICAgLy8gUHJvZ3Jlc3MgZXZlbnRzXG4gICAgb25Qcm9ncmVzczogKGNhbGxiYWNrOiAocHJvZ3Jlc3M6IG51bWJlcikgPT4gdm9pZCkgPT4ge1xuICAgICAgICBpcGNSZW5kZXJlci5vbigncHJvZ3Jlc3MnLCAoX2V2ZW50LCBwcm9ncmVzcykgPT4gY2FsbGJhY2socHJvZ3Jlc3MpKTtcbiAgICB9LFxufSk7XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUdBLGtCQUFjLGtCQUFrQixlQUFlO0FBQUE7QUFBQSxNQUUzQyxhQUFhLENBQUMsU0FBZSxTQUFTLGVBQWUsSUFBSTtBQUFBO0FBQUEsTUFHekQsZUFBZSxDQUFDLFFBQWdCLFlBQVksT0FBTyxhQUFhLEdBQUc7QUFBQSxNQUNuRSxlQUFlLENBQUMsS0FBYSxVQUFtQixZQUFZLE9BQU8sYUFBYSxLQUFLLEtBQUs7QUFBQTtBQUFBLE1BRzFGLGdCQUFnQixNQUFNLFlBQVksT0FBTyxpQkFBaUI7QUFBQSxNQUMxRCx3QkFBd0IsTUFBTSxZQUFZLE9BQU8seUJBQXlCO0FBQUEsTUFDMUUsZ0JBQWdCLENBQUMsZ0JBQXdCLFlBQVksT0FBTyxtQkFBbUIsV0FBVztBQUFBLE1BQzFGLGdCQUFnQixDQUFDLFlBQXdDLFlBQVksT0FBTyx5QkFBeUIsT0FBTztBQUFBO0FBQUEsTUFHNUcsVUFBVSxDQUFDLFNBQWlCLFlBQVksT0FBTyxhQUFhLElBQUk7QUFBQSxNQUNoRSxtQkFBbUIsQ0FBQyxTQUFpQixZQUFZLE9BQU8sc0JBQXNCLElBQUk7QUFBQSxNQUNsRixXQUFXLENBQUMsTUFBYyxTQUFpQixZQUFZLE9BQU8sY0FBYyxNQUFNLElBQUk7QUFBQSxNQUN0RixhQUFhLENBQUMsU0FBaUIsWUFBWSxPQUFPLGdCQUFnQixJQUFJO0FBQUEsTUFDdEUsYUFBYSxNQUFNLFlBQVksT0FBTyxrQkFBa0I7QUFBQSxNQUN4RCxjQUFjLENBQUMsU0FBaUIsWUFBWSxPQUFPLHFCQUFxQixJQUFJO0FBQUE7QUFBQSxNQUc1RSxjQUFjLENBQUMsV0FBbUIsZUFDOUIsWUFBWSxPQUFPLHVCQUF1QixXQUFXLFVBQVU7QUFBQSxNQUNuRSxhQUFhLENBQUMsYUFDVixZQUFZLE9BQU8sc0JBQXNCLFFBQVE7QUFBQSxNQUNyRCxnQkFBZ0IsQ0FBQyxVQUFrQixXQUFtQixnQkFDbEQsWUFBWSxPQUFPLHlCQUF5QixVQUFVLFdBQVcsV0FBVztBQUFBLE1BQ2hGLFlBQVksQ0FBQyxXQUFtQixXQUM1QixZQUFZLE9BQU8scUJBQXFCLFdBQVcsTUFBTTtBQUFBO0FBQUEsTUFHN0QsWUFBWSxDQUFDLGFBQXlDO0FBQ2xELG9CQUFZLEdBQUcsWUFBWSxDQUFDLFFBQVEsYUFBYSxTQUFTLFFBQVEsQ0FBQztBQUFBLE1BQ3ZFO0FBQUEsSUFDSixDQUFDO0FBQUE7QUFBQTsifQ==
