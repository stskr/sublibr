import { app as l, BrowserWindow as y, ipcMain as r, dialog as F, shell as b } from "electron";
import o from "path";
import g from "fs";
import { fileURLToPath as I } from "url";
import D from "electron-store";
import m from "fluent-ffmpeg";
import { createRequire as T } from "module";
const E = o.dirname(I(import.meta.url)), v = /* @__PURE__ */ new Set();
function f(n, ...e) {
  if (typeof n != "string") throw new Error("Invalid path: must be a string");
  const t = o.resolve(n);
  if (v.has(t)) return t;
  for (const a of e) {
    const s = o.resolve(a);
    if (t === s || t.startsWith(s + o.sep))
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
const S = ["settings"];
if (l.isPackaged) {
  const n = process.platform === "win32" ? ".exe" : "";
  m.setFfmpegPath(o.join(process.resourcesPath, "ffmpeg", "ffmpeg" + n)), m.setFfprobePath(o.join(process.resourcesPath, "ffprobe", "ffprobe" + n));
} else {
  const n = T(import.meta.url);
  m.setFfmpegPath(n("@ffmpeg-installer/ffmpeg").path), m.setFfprobePath(n("@ffprobe-installer/ffprobe").path);
}
const x = new D();
let p = null;
function R() {
  p = new y({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: o.join(E, "preload.js"),
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !0
    },
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0a0a0f"
  }), p.webContents.setWindowOpenHandler(({ url: n }) => ((n.startsWith("http://") || n.startsWith("https://")) && b.openExternal(n), { action: "deny" })), p.webContents.on("will-navigate", (n, e) => {
    const t = process.env.VITE_DEV_SERVER_URL || "file://";
    e.startsWith(t) || (n.preventDefault(), b.openExternal(e));
  }), process.env.VITE_DEV_SERVER_URL ? (p.loadURL(process.env.VITE_DEV_SERVER_URL), p.webContents.openDevTools()) : p.loadFile(o.join(E, "../dist/index.html"));
}
l.whenReady().then(R);
l.on("window-all-closed", () => {
  process.platform !== "darwin" && l.quit();
});
l.on("before-quit", () => {
  try {
    const n = l.getPath("temp"), e = g.readdirSync(n);
    for (const t of e)
      /^(chunk_\d+\.flac|gap_heal_\d+.*\.mp3)$/.test(t) && g.unlinkSync(o.join(n, t));
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
  const e = (await F.showOpenDialog(p, {
    properties: ["openFile"],
    filters: [
      { name: "Media Files", extensions: ["mp4", "mkv", "avi", "mov", "webm", "mp3", "wav", "aac", "m4a", "ogg", "flac"] }
    ]
  })).filePaths[0] || null;
  return e && v.add(o.resolve(e)), e;
});
r.handle("dialog:saveFile", async (n, e) => {
  const a = (await F.showSaveDialog(p, {
    defaultPath: e,
    filters: [{ name: "SRT Subtitle", extensions: ["srt"] }]
  })).filePath || null;
  return a && v.add(o.resolve(a)), a;
});
r.handle("file:read", async (n, e) => {
  const t = f(e, ...c());
  return g.promises.readFile(t);
});
r.handle("file:readAsDataUrl", async (n, e) => {
  const t = f(e, ...c()), a = await g.promises.readFile(t), s = o.extname(t).toLowerCase().slice(1);
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
r.handle("file:write", async (n, e, t) => {
  const a = f(e, ...c());
  await g.promises.writeFile(a, t, "utf-8");
});
r.handle("file:getInfo", async (n, e) => {
  const t = f(e, ...c());
  return {
    size: (await g.promises.stat(t)).size,
    path: t,
    name: o.basename(t),
    ext: o.extname(t).toLowerCase()
  };
});
r.handle("file:getTempPath", () => l.getPath("temp"));
r.handle("ffmpeg:extractAudio", async (n, e, t) => {
  const a = f(e, ...c()), s = f(t, ...c());
  return new Promise((i, d) => {
    m(a).audioCodec("flac").toFormat("flac").on("end", () => i(s)).on("error", (h) => d(h.message)).save(s);
  });
});
r.handle("ffmpeg:getDuration", async (n, e) => {
  const t = f(e, ...c());
  return new Promise((a, s) => {
    m.ffprobe(t, (i, d) => {
      i ? s(i.message) : a(d.format.duration || 0);
    });
  });
});
r.handle("ffmpeg:detectSilences", async (n, e, t, a) => {
  const s = f(e, ...c());
  if (!Number.isFinite(t) || t < -100 || t > 0)
    throw new Error("Invalid threshold: must be between -100 and 0");
  if (!Number.isFinite(a) || a < 0.1 || a > 60)
    throw new Error("Invalid minDuration: must be between 0.1 and 60");
  return new Promise((i, d) => {
    const h = [];
    let u = null;
    m(s).audioFilters(`silencedetect=noise=${t}dB:d=${a}`).format("null").on("stderr", (w) => {
      const P = w.match(/silence_start:\s*([\d.]+)/);
      P && (u = { start: parseFloat(P[1]) });
      const _ = w.match(/silence_end:\s*([\d.]+)/);
      _ && u && (u.end = parseFloat(_[1]), h.push(u), u = null);
    }).on("end", () => i(h)).on("error", (w) => d(w.message)).output(process.platform === "win32" ? "NUL" : "/dev/null").run();
  });
});
r.handle("ffmpeg:splitAudio", async (n, e, t) => {
  const a = f(e, ...c()), s = [];
  for (const i of t) {
    const d = f(i.outputPath, ...c());
    await new Promise((h, u) => {
      m(a).setStartTime(i.start).setDuration(i.end - i.start).audioCodec("flac").toFormat("flac").on("end", () => {
        s.push(d), h();
      }).on("error", (w) => u(w.message)).save(d);
    });
  }
  return s;
});
