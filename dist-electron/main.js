import { app as p, BrowserWindow as v, ipcMain as n, dialog as _ } from "electron";
import l from "path";
import u from "fs";
import { fileURLToPath as y } from "url";
import P from "electron-store";
import i from "fluent-ffmpeg";
import { createRequire as x } from "module";
const w = l.dirname(y(import.meta.url));
if (p.isPackaged) {
  const t = process.platform === "win32" ? ".exe" : "";
  i.setFfmpegPath(l.join(process.resourcesPath, "ffmpeg", "ffmpeg" + t)), i.setFfprobePath(l.join(process.resourcesPath, "ffprobe", "ffprobe" + t));
} else {
  const t = x(import.meta.url);
  i.setFfmpegPath(t("@ffmpeg-installer/ffmpeg").path), i.setFfprobePath(t("@ffprobe-installer/ffprobe").path);
}
const b = new P();
let d = null;
function F() {
  d = new v({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: l.join(w, "preload.js"),
      contextIsolation: !0,
      nodeIntegration: !1
      // sandbox: true, // Default is true, explicit for clarity
    },
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0a0a0f"
  }), process.env.VITE_DEV_SERVER_URL ? (d.loadURL(process.env.VITE_DEV_SERVER_URL), d.webContents.openDevTools()) : d.loadFile(l.join(w, "../dist/index.html"));
}
p.whenReady().then(F);
p.on("window-all-closed", () => {
  process.platform !== "darwin" && p.quit();
});
p.on("activate", () => {
  v.getAllWindows().length === 0 && F();
});
n.handle("store:get", (t, e) => b.get(e));
n.handle("store:set", (t, e, a) => {
  b.set(e, a);
});
n.handle("dialog:openFile", async () => (await _.showOpenDialog(d, {
  properties: ["openFile"],
  filters: [
    { name: "Media Files", extensions: ["mp4", "mkv", "avi", "mov", "webm", "mp3", "wav", "aac", "m4a", "ogg", "flac"] }
  ]
})).filePaths[0] || null);
n.handle("dialog:saveFile", async (t, e) => (await _.showSaveDialog(d, {
  defaultPath: e,
  filters: [{ name: "SRT Subtitle", extensions: ["srt"] }]
})).filePath || null);
n.handle("file:read", async (t, e) => u.promises.readFile(e));
n.handle("file:readAsDataUrl", async (t, e) => {
  const a = await u.promises.readFile(e), s = l.extname(e).toLowerCase().slice(1);
  return `data:${{
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
  }[s] || "application/octet-stream"};base64,${a.toString("base64")}`;
});
n.handle("file:write", async (t, e, a) => {
  await u.promises.writeFile(e, a, "utf-8");
});
n.handle("file:getInfo", async (t, e) => ({
  size: (await u.promises.stat(e)).size,
  path: e,
  name: l.basename(e),
  ext: l.extname(e).toLowerCase()
}));
n.handle("file:getTempPath", () => p.getPath("temp"));
n.handle("ffmpeg:extractAudio", async (t, e, a) => new Promise((s, o) => {
  i(e).audioCodec("flac").toFormat("flac").on("end", () => s(a)).on("error", (r) => o(r.message)).save(a);
}));
n.handle("ffmpeg:getDuration", async (t, e) => new Promise((a, s) => {
  i.ffprobe(e, (o, r) => {
    o ? s(o.message) : a(r.format.duration || 0);
  });
}));
n.handle("ffmpeg:detectSilences", async (t, e, a, s) => new Promise((o, r) => {
  const c = [];
  let m = null;
  i(e).audioFilters(`silencedetect=noise=${a}dB:d=${s}`).format("null").on("stderr", (f) => {
    const h = f.match(/silence_start:\s*([\d.]+)/);
    h && (m = { start: parseFloat(h[1]) });
    const g = f.match(/silence_end:\s*([\d.]+)/);
    g && m && (m.end = parseFloat(g[1]), c.push(m), m = null);
  }).on("end", () => o(c)).on("error", (f) => r(f.message)).output(process.platform === "win32" ? "NUL" : "/dev/null").run();
}));
n.handle("ffmpeg:splitAudio", async (t, e, a) => {
  const s = [];
  for (const o of a)
    await new Promise((r, c) => {
      i(e).setStartTime(o.start).setDuration(o.end - o.start).audioCodec("flac").toFormat("flac").on("end", () => {
        s.push(o.outputPath), r();
      }).on("error", (m) => c(m.message)).save(o.outputPath);
    });
  return s;
});
