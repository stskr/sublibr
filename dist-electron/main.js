import { app as l, BrowserWindow as I, ipcMain as s, dialog as _, shell as x } from "electron";
import o from "path";
import v from "fs";
import { fileURLToPath as R } from "url";
import U from "electron-store";
import m from "fluent-ffmpeg";
import { createRequire as A } from "module";
import T from "electron-updater";
const { autoUpdater: c } = T, S = o.dirname(R(import.meta.url)), b = /* @__PURE__ */ new Set();
function p(t, ...e) {
  if (typeof t != "string") throw new Error("Invalid path: must be a string");
  const a = o.resolve(t);
  if (b.has(a)) return a;
  for (const n of e) {
    const i = o.resolve(n);
    if (a === i || a.startsWith(i + o.sep))
      return a;
  }
  throw new Error("Access denied: path is outside allowed directories");
}
function f() {
  return [
    l.getPath("temp"),
    l.getPath("userData")
  ];
}
const P = ["settings", "recent-files", "subtitle-cache"];
if (l.isPackaged) {
  const t = process.platform === "win32" ? ".exe" : "";
  m.setFfmpegPath(o.join(process.resourcesPath, "ffmpeg", "ffmpeg" + t)), m.setFfprobePath(o.join(process.resourcesPath, "ffprobe", "ffprobe" + t));
} else {
  const t = A(import.meta.url);
  m.setFfmpegPath(t("@ffmpeg-installer/ffmpeg").path), m.setFfprobePath(t("@ffprobe-installer/ffprobe").path);
}
const E = new U();
let d = null;
function D() {
  d = new I({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: o.join(S, "preload.js"),
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !0
    },
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0a0a0f"
  }), d.webContents.setWindowOpenHandler(({ url: t }) => ((t.startsWith("http://") || t.startsWith("https://")) && x.openExternal(t), { action: "deny" })), d.webContents.on("will-navigate", (t, e) => {
    const a = process.env.VITE_DEV_SERVER_URL || "file://";
    e.startsWith(a) || (t.preventDefault(), x.openExternal(e));
  }), process.env.VITE_DEV_SERVER_URL ? (d.loadURL(process.env.VITE_DEV_SERVER_URL), d.webContents.openDevTools()) : d.loadFile(o.join(S, "../dist/index.html"));
}
l.whenReady().then(D);
l.on("window-all-closed", () => {
  process.platform !== "darwin" && l.quit();
});
l.on("before-quit", () => {
  try {
    const t = l.getPath("temp"), e = v.readdirSync(t);
    for (const a of e)
      /^(chunk_\d+\.flac|gap_heal_\d+.*\.flac|subtitles_gen_audio_\d+\.flac)$/.test(a) && v.unlinkSync(o.join(t, a));
  } catch {
  }
});
l.on("activate", () => {
  I.getAllWindows().length === 0 && D();
});
l.isPackaged && (c.autoDownload = !1, c.autoInstallOnAppQuit = !0, l.whenReady().then(() => {
  setTimeout(() => {
    c.checkForUpdates().catch(() => {
    });
  }, 5e3);
}), c.on("update-available", (t) => {
  d?.webContents.send("update-available", {
    version: t.version,
    releaseNotes: t.releaseNotes,
    releaseDate: t.releaseDate
  });
}), c.on("download-progress", (t) => {
  d?.webContents.send("update-download-progress", {
    percent: Math.round(t.percent),
    transferred: t.transferred,
    total: t.total
  });
}), c.on("update-downloaded", (t) => {
  d?.webContents.send("update-downloaded", {
    version: t.version
  });
}), c.on("error", (t) => {
  d?.webContents.send("update-error", t.message);
}));
s.handle("store:get", (t, e) => {
  if (typeof e != "string" || !P.includes(e))
    throw new Error(`Invalid store key: ${e}`);
  return E.get(e);
});
s.handle("store:set", (t, e, a) => {
  if (typeof e != "string" || !P.includes(e))
    throw new Error(`Invalid store key: ${e}`);
  E.set(e, a);
});
s.handle("store:delete", (t, e) => {
  if (typeof e != "string" || !P.includes(e))
    throw new Error(`Invalid store key: ${e}`);
  E.delete(e);
});
s.handle("dialog:openFile", async () => {
  const e = (await _.showOpenDialog(d, {
    properties: ["openFile"],
    filters: [
      { name: "Media Files", extensions: ["mp4", "mkv", "avi", "mov", "webm", "mp3", "wav", "aac", "m4a", "ogg", "flac"] }
    ]
  })).filePaths[0] || null;
  return e && b.add(o.resolve(e)), e;
});
s.handle("dialog:openSubtitleFile", async () => {
  const e = (await _.showOpenDialog(d, {
    properties: ["openFile"],
    filters: [
      { name: "Subtitle Files", extensions: ["srt", "vtt", "ass", "ssa"] }
    ]
  })).filePaths[0] || null;
  return e && b.add(o.resolve(e)), e;
});
s.handle("dialog:saveFile", async (t, e, a, n) => {
  const r = (await _.showSaveDialog(d, {
    defaultPath: e,
    filters: [{ name: a || "Subtitle File", extensions: n || [e.split(".").pop() || "srt"] }]
  })).filePath || null;
  return r && b.add(o.resolve(r)), r;
});
s.handle("dialog:showMessageBox", async (t, e) => _.showMessageBox(d, e));
s.handle("file:read", async (t, e) => {
  const a = p(e, ...f());
  return v.promises.readFile(a);
});
s.handle("file:readAsDataUrl", async (t, e) => {
  const a = p(e, ...f()), n = await v.promises.readFile(a), i = o.extname(a).toLowerCase().slice(1);
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
  }[i] || "application/octet-stream"};base64,${n.toString("base64")}`;
});
s.handle("file:write", async (t, e, a) => {
  const n = p(e, ...f());
  await v.promises.writeFile(n, a, "utf-8");
});
s.handle("file:getInfo", async (t, e) => {
  const a = p(e, ...f());
  return {
    size: (await v.promises.stat(a)).size,
    path: a,
    name: o.basename(a),
    ext: o.extname(a).toLowerCase()
  };
});
s.handle("file:getTempPath", () => l.getPath("temp"));
const C = /* @__PURE__ */ new Set([
  ".mp4",
  ".mkv",
  ".avi",
  ".mov",
  ".webm",
  ".ts",
  ".mts",
  ".m2ts",
  ".mp3",
  ".wav",
  ".m4a",
  ".flac",
  ".ogg",
  ".aac",
  ".wma",
  ".alac",
  ".aiff"
]);
s.handle("file:registerPath", (t, e) => {
  if (typeof e != "string") return;
  const a = o.resolve(e), n = o.extname(a).toLowerCase();
  if (!C.has(n))
    throw new Error("Only media files can be registered");
  b.add(a);
});
s.handle("ffmpeg:extractAudio", async (t, e, a) => {
  const n = p(e, ...f()), i = p(a, ...f());
  return new Promise((r, u) => {
    m(n).audioCodec("flac").toFormat("flac").on("end", () => r(i)).on("error", (w) => u(w.message)).save(i);
  });
});
s.handle("ffmpeg:getDuration", async (t, e) => {
  const a = p(e, ...f());
  return new Promise((n, i) => {
    m.ffprobe(a, (r, u) => {
      r ? i(r.message) : n(u.format.duration || 0);
    });
  });
});
s.handle("ffmpeg:detectSilences", async (t, e, a, n) => {
  const i = p(e, ...f());
  if (!Number.isFinite(a) || a < -100 || a > 0)
    throw new Error("Invalid threshold: must be between -100 and 0");
  if (!Number.isFinite(n) || n < 0.1 || n > 60)
    throw new Error("Invalid minDuration: must be between 0.1 and 60");
  return new Promise((r, u) => {
    const w = [];
    let h = null;
    m(i).audioFilters(`silencedetect=noise=${a}dB:d=${n}`).format("null").on("stderr", (g) => {
      const y = g.match(/silence_start:\s*([\d.]+)/);
      y && (h = { start: parseFloat(y[1]) });
      const F = g.match(/silence_end:\s*([\d.]+)/);
      F && h && (h.end = parseFloat(F[1]), w.push(h), h = null);
    }).on("end", () => r(w)).on("error", (g) => u(g.message)).output(process.platform === "win32" ? "NUL" : "/dev/null").run();
  });
});
s.handle("ffmpeg:splitAudio", async (t, e, a) => {
  const n = p(e, ...f()), i = [];
  for (const r of a) {
    const u = p(r.outputPath, ...f());
    await new Promise((w, h) => {
      m(n).setStartTime(r.start).setDuration(r.end - r.start).audioCodec("flac").toFormat("flac").on("end", () => {
        i.push(u), w();
      }).on("error", (g) => h(g.message)).save(u);
    });
  }
  return i;
});
s.handle("app:getVersion", () => l.getVersion());
s.handle("app:checkForUpdates", async () => {
  if (!l.isPackaged) return { updateAvailable: !1 };
  try {
    return { updateAvailable: !!(await c.checkForUpdates())?.updateInfo };
  } catch {
    return { updateAvailable: !1 };
  }
});
s.handle("app:downloadUpdate", async () => {
  l.isPackaged && await c.downloadUpdate();
});
s.handle("app:installUpdate", () => {
  c.quitAndInstall(!1, !0);
});
