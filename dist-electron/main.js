import { app as l, BrowserWindow as y, ipcMain as r, dialog as P, shell as E } from "electron";
import a from "path";
import g from "fs";
import { fileURLToPath as D } from "url";
import I from "electron-store";
import m from "fluent-ffmpeg";
import { createRequire as T } from "module";
const F = a.dirname(D(import.meta.url)), v = /* @__PURE__ */ new Set();
function f(n, ...e) {
  if (typeof n != "string") throw new Error("Invalid path: must be a string");
  const t = a.resolve(n);
  if (v.has(t)) return t;
  for (const s of e) {
    const o = a.resolve(s);
    if (t === o || t.startsWith(o + a.sep))
      return t;
  }
  throw new Error("Access denied: path is outside allowed directories");
}
function d() {
  return [
    l.getPath("temp"),
    l.getPath("userData")
  ];
}
const S = ["settings"];
if (l.isPackaged) {
  const n = process.platform === "win32" ? ".exe" : "";
  m.setFfmpegPath(a.join(process.resourcesPath, "ffmpeg", "ffmpeg" + n)), m.setFfprobePath(a.join(process.resourcesPath, "ffprobe", "ffprobe" + n));
} else {
  const n = T(import.meta.url);
  m.setFfmpegPath(n("@ffmpeg-installer/ffmpeg").path), m.setFfprobePath(n("@ffprobe-installer/ffprobe").path);
}
const x = new I();
let p = null;
function R() {
  p = new y({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: a.join(F, "preload.js"),
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !0
    },
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0a0a0f"
  }), p.webContents.setWindowOpenHandler(({ url: n }) => ((n.startsWith("http://") || n.startsWith("https://")) && E.openExternal(n), { action: "deny" })), p.webContents.on("will-navigate", (n, e) => {
    const t = process.env.VITE_DEV_SERVER_URL || "file://";
    e.startsWith(t) || (n.preventDefault(), E.openExternal(e));
  }), process.env.VITE_DEV_SERVER_URL ? (p.loadURL(process.env.VITE_DEV_SERVER_URL), p.webContents.openDevTools()) : p.loadFile(a.join(F, "../dist/index.html"));
}
l.whenReady().then(R);
l.on("window-all-closed", () => {
  process.platform !== "darwin" && l.quit();
});
l.on("before-quit", () => {
  try {
    const n = l.getPath("temp"), e = g.readdirSync(n);
    for (const t of e)
      /^(chunk_\d+\.flac|gap_heal_\d+.*\.mp3)$/.test(t) && g.unlinkSync(a.join(n, t));
  } catch {
  }
});
l.on("activate", () => {
  y.getAllWindows().length === 0 && R();
});
r.handle("store:get", (n, e) => {
  if (typeof e != "string" || !S.includes(e))
    throw new Error(`Invalid store key: ${e}`);
  return x.get(e);
});
r.handle("store:set", (n, e, t) => {
  if (typeof e != "string" || !S.includes(e))
    throw new Error(`Invalid store key: ${e}`);
  x.set(e, t);
});
r.handle("dialog:openFile", async () => {
  const e = (await P.showOpenDialog(p, {
    properties: ["openFile"],
    filters: [
      { name: "Media Files", extensions: ["mp4", "mkv", "avi", "mov", "webm", "mp3", "wav", "aac", "m4a", "ogg", "flac"] }
    ]
  })).filePaths[0] || null;
  return e && v.add(a.resolve(e)), e;
});
r.handle("dialog:openSubtitleFile", async () => {
  const e = (await P.showOpenDialog(p, {
    properties: ["openFile"],
    filters: [
      { name: "Subtitle Files", extensions: ["srt", "vtt", "ass", "ssa"] }
    ]
  })).filePaths[0] || null;
  return e && v.add(a.resolve(e)), e;
});
r.handle("dialog:saveFile", async (n, e) => {
  const s = (await P.showSaveDialog(p, {
    defaultPath: e,
    filters: [{ name: "SRT Subtitle", extensions: ["srt"] }]
  })).filePath || null;
  return s && v.add(a.resolve(s)), s;
});
r.handle("file:read", async (n, e) => {
  const t = f(e, ...d());
  return g.promises.readFile(t);
});
r.handle("file:readAsDataUrl", async (n, e) => {
  const t = f(e, ...d()), s = await g.promises.readFile(t), o = a.extname(t).toLowerCase().slice(1);
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
  }[o] || "application/octet-stream"};base64,${s.toString("base64")}`;
});
r.handle("file:write", async (n, e, t) => {
  const s = f(e, ...d());
  await g.promises.writeFile(s, t, "utf-8");
});
r.handle("file:getInfo", async (n, e) => {
  const t = f(e, ...d());
  return {
    size: (await g.promises.stat(t)).size,
    path: t,
    name: a.basename(t),
    ext: a.extname(t).toLowerCase()
  };
});
r.handle("file:getTempPath", () => l.getPath("temp"));
r.handle("ffmpeg:extractAudio", async (n, e, t) => {
  const s = f(e, ...d()), o = f(t, ...d());
  return new Promise((i, c) => {
    m(s).audioCodec("flac").toFormat("flac").on("end", () => i(o)).on("error", (h) => c(h.message)).save(o);
  });
});
r.handle("ffmpeg:getDuration", async (n, e) => {
  const t = f(e, ...d());
  return new Promise((s, o) => {
    m.ffprobe(t, (i, c) => {
      i ? o(i.message) : s(c.format.duration || 0);
    });
  });
});
r.handle("ffmpeg:detectSilences", async (n, e, t, s) => {
  const o = f(e, ...d());
  if (!Number.isFinite(t) || t < -100 || t > 0)
    throw new Error("Invalid threshold: must be between -100 and 0");
  if (!Number.isFinite(s) || s < 0.1 || s > 60)
    throw new Error("Invalid minDuration: must be between 0.1 and 60");
  return new Promise((i, c) => {
    const h = [];
    let u = null;
    m(o).audioFilters(`silencedetect=noise=${t}dB:d=${s}`).format("null").on("stderr", (w) => {
      const b = w.match(/silence_start:\s*([\d.]+)/);
      b && (u = { start: parseFloat(b[1]) });
      const _ = w.match(/silence_end:\s*([\d.]+)/);
      _ && u && (u.end = parseFloat(_[1]), h.push(u), u = null);
    }).on("end", () => i(h)).on("error", (w) => c(w.message)).output(process.platform === "win32" ? "NUL" : "/dev/null").run();
  });
});
r.handle("ffmpeg:splitAudio", async (n, e, t) => {
  const s = f(e, ...d()), o = [];
  for (const i of t) {
    const c = f(i.outputPath, ...d());
    await new Promise((h, u) => {
      m(s).setStartTime(i.start).setDuration(i.end - i.start).audioCodec("flac").toFormat("flac").on("end", () => {
        o.push(c), h();
      }).on("error", (w) => u(w.message)).save(c);
    });
  }
  return o;
});
