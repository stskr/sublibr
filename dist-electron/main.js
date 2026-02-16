import { app as l, BrowserWindow as y, ipcMain as r, dialog as F } from "electron";
import s from "path";
import g from "fs";
import { fileURLToPath as I } from "url";
import R from "electron-store";
import m from "fluent-ffmpeg";
import { createRequire as T } from "module";
const b = s.dirname(I(import.meta.url)), v = /* @__PURE__ */ new Set();
function f(a, ...e) {
  if (typeof a != "string") throw new Error("Invalid path: must be a string");
  const t = s.resolve(a);
  if (v.has(t)) return t;
  for (const n of e) {
    const o = s.resolve(n);
    if (t === o || t.startsWith(o + s.sep))
      return t;
  }
  throw new Error("Access denied: path is outside allowed directories");
}
function c() {
  return [
    l.getPath("temp"),
    l.getPath("userData")
  ];
}
const E = ["settings"];
if (l.isPackaged) {
  const a = process.platform === "win32" ? ".exe" : "";
  m.setFfmpegPath(s.join(process.resourcesPath, "ffmpeg", "ffmpeg" + a)), m.setFfprobePath(s.join(process.resourcesPath, "ffprobe", "ffprobe" + a));
} else {
  const a = T(import.meta.url);
  m.setFfmpegPath(a("@ffmpeg-installer/ffmpeg").path), m.setFfprobePath(a("@ffprobe-installer/ffprobe").path);
}
const S = new R();
let w = null;
function x() {
  w = new y({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: s.join(b, "preload.js"),
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !0
    },
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0a0a0f"
  }), process.env.VITE_DEV_SERVER_URL ? (w.loadURL(process.env.VITE_DEV_SERVER_URL), w.webContents.openDevTools()) : w.loadFile(s.join(b, "../dist/index.html"));
}
l.whenReady().then(x);
l.on("window-all-closed", () => {
  process.platform !== "darwin" && l.quit();
});
l.on("before-quit", () => {
  try {
    const a = l.getPath("temp"), e = g.readdirSync(a);
    for (const t of e)
      /^(chunk_\d+\.flac|gap_heal_\d+.*\.mp3)$/.test(t) && g.unlinkSync(s.join(a, t));
  } catch {
  }
});
l.on("activate", () => {
  y.getAllWindows().length === 0 && x();
});
r.handle("store:get", (a, e) => {
  if (typeof e != "string" || !E.includes(e))
    throw new Error(`Invalid store key: ${e}`);
  return S.get(e);
});
r.handle("store:set", (a, e, t) => {
  if (typeof e != "string" || !E.includes(e))
    throw new Error(`Invalid store key: ${e}`);
  S.set(e, t);
});
r.handle("dialog:openFile", async () => {
  const e = (await F.showOpenDialog(w, {
    properties: ["openFile"],
    filters: [
      { name: "Media Files", extensions: ["mp4", "mkv", "avi", "mov", "webm", "mp3", "wav", "aac", "m4a", "ogg", "flac"] }
    ]
  })).filePaths[0] || null;
  return e && v.add(s.resolve(e)), e;
});
r.handle("dialog:saveFile", async (a, e) => {
  const n = (await F.showSaveDialog(w, {
    defaultPath: e,
    filters: [{ name: "SRT Subtitle", extensions: ["srt"] }]
  })).filePath || null;
  return n && v.add(s.resolve(n)), n;
});
r.handle("file:read", async (a, e) => {
  const t = f(e, ...c());
  return g.promises.readFile(t);
});
r.handle("file:readAsDataUrl", async (a, e) => {
  const t = f(e, ...c()), n = await g.promises.readFile(t), o = s.extname(t).toLowerCase().slice(1);
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
  }[o] || "application/octet-stream"};base64,${n.toString("base64")}`;
});
r.handle("file:write", async (a, e, t) => {
  const n = f(e, ...c());
  await g.promises.writeFile(n, t, "utf-8");
});
r.handle("file:getInfo", async (a, e) => {
  const t = f(e, ...c());
  return {
    size: (await g.promises.stat(t)).size,
    path: t,
    name: s.basename(t),
    ext: s.extname(t).toLowerCase()
  };
});
r.handle("file:getTempPath", () => l.getPath("temp"));
r.handle("ffmpeg:extractAudio", async (a, e, t) => {
  const n = f(e, ...c()), o = f(t, ...c());
  return new Promise((i, d) => {
    m(n).audioCodec("flac").toFormat("flac").on("end", () => i(o)).on("error", (u) => d(u.message)).save(o);
  });
});
r.handle("ffmpeg:getDuration", async (a, e) => {
  const t = f(e, ...c());
  return new Promise((n, o) => {
    m.ffprobe(t, (i, d) => {
      i ? o(i.message) : n(d.format.duration || 0);
    });
  });
});
r.handle("ffmpeg:detectSilences", async (a, e, t, n) => {
  const o = f(e, ...c());
  if (!Number.isFinite(t) || t < -100 || t > 0)
    throw new Error("Invalid threshold: must be between -100 and 0");
  if (!Number.isFinite(n) || n < 0.1 || n > 60)
    throw new Error("Invalid minDuration: must be between 0.1 and 60");
  return new Promise((i, d) => {
    const u = [];
    let p = null;
    m(o).audioFilters(`silencedetect=noise=${t}dB:d=${n}`).format("null").on("stderr", (h) => {
      const P = h.match(/silence_start:\s*([\d.]+)/);
      P && (p = { start: parseFloat(P[1]) });
      const _ = h.match(/silence_end:\s*([\d.]+)/);
      _ && p && (p.end = parseFloat(_[1]), u.push(p), p = null);
    }).on("end", () => i(u)).on("error", (h) => d(h.message)).output(process.platform === "win32" ? "NUL" : "/dev/null").run();
  });
});
r.handle("ffmpeg:splitAudio", async (a, e, t) => {
  const n = f(e, ...c()), o = [];
  for (const i of t) {
    const d = f(i.outputPath, ...c());
    await new Promise((u, p) => {
      m(n).setStartTime(i.start).setDuration(i.end - i.start).audioCodec("flac").toFormat("flac").on("end", () => {
        o.push(d), u();
      }).on("error", (h) => p(h.message)).save(d);
    });
  }
  return o;
});
