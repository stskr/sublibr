import { app as r, BrowserWindow as x, ipcMain as s, dialog as P, shell as F } from "electron";
import o from "path";
import v from "fs";
import { fileURLToPath as R } from "url";
import U from "electron-store";
import m from "fluent-ffmpeg";
import { createRequire as T } from "module";
import { autoUpdater as p } from "electron-updater";
const E = o.dirname(R(import.meta.url)), b = /* @__PURE__ */ new Set();
function c(t, ...e) {
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
    r.getPath("temp"),
    r.getPath("userData")
  ];
}
const S = ["settings", "recent-files"];
if (r.isPackaged) {
  const t = process.platform === "win32" ? ".exe" : "";
  m.setFfmpegPath(o.join(process.resourcesPath, "ffmpeg", "ffmpeg" + t)), m.setFfprobePath(o.join(process.resourcesPath, "ffprobe", "ffprobe" + t));
} else {
  const t = T(import.meta.url);
  m.setFfmpegPath(t("@ffmpeg-installer/ffmpeg").path), m.setFfprobePath(t("@ffprobe-installer/ffprobe").path);
}
const D = new U();
let l = null;
function I() {
  l = new x({
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
  }), l.webContents.setWindowOpenHandler(({ url: t }) => ((t.startsWith("http://") || t.startsWith("https://")) && F.openExternal(t), { action: "deny" })), l.webContents.on("will-navigate", (t, e) => {
    const a = process.env.VITE_DEV_SERVER_URL || "file://";
    e.startsWith(a) || (t.preventDefault(), F.openExternal(e));
  }), process.env.VITE_DEV_SERVER_URL ? (l.loadURL(process.env.VITE_DEV_SERVER_URL), l.webContents.openDevTools()) : l.loadFile(o.join(E, "../dist/index.html"));
}
r.whenReady().then(I);
r.on("window-all-closed", () => {
  process.platform !== "darwin" && r.quit();
});
r.on("before-quit", () => {
  try {
    const t = r.getPath("temp"), e = v.readdirSync(t);
    for (const a of e)
      /^(chunk_\d+\.flac|gap_heal_\d+.*\.mp3)$/.test(a) && v.unlinkSync(o.join(t, a));
  } catch {
  }
});
r.on("activate", () => {
  x.getAllWindows().length === 0 && I();
});
r.isPackaged && (p.autoDownload = !1, p.autoInstallOnAppQuit = !0, r.whenReady().then(() => {
  setTimeout(() => {
    p.checkForUpdates().catch(() => {
    });
  }, 5e3);
}), p.on("update-available", (t) => {
  l?.webContents.send("update-available", {
    version: t.version,
    releaseNotes: t.releaseNotes,
    releaseDate: t.releaseDate
  });
}), p.on("download-progress", (t) => {
  l?.webContents.send("update-download-progress", {
    percent: Math.round(t.percent),
    transferred: t.transferred,
    total: t.total
  });
}), p.on("update-downloaded", (t) => {
  l?.webContents.send("update-downloaded", {
    version: t.version
  });
}), p.on("error", (t) => {
  l?.webContents.send("update-error", t.message);
}));
s.handle("store:get", (t, e) => {
  if (typeof e != "string" || !S.includes(e))
    throw new Error(`Invalid store key: ${e}`);
  return D.get(e);
});
s.handle("store:set", (t, e, a) => {
  if (typeof e != "string" || !S.includes(e))
    throw new Error(`Invalid store key: ${e}`);
  D.set(e, a);
});
s.handle("dialog:openFile", async () => {
  const e = (await P.showOpenDialog(l, {
    properties: ["openFile"],
    filters: [
      { name: "Media Files", extensions: ["mp4", "mkv", "avi", "mov", "webm", "mp3", "wav", "aac", "m4a", "ogg", "flac"] }
    ]
  })).filePaths[0] || null;
  return e && b.add(o.resolve(e)), e;
});
s.handle("dialog:openSubtitleFile", async () => {
  const e = (await P.showOpenDialog(l, {
    properties: ["openFile"],
    filters: [
      { name: "Subtitle Files", extensions: ["srt", "vtt", "ass", "ssa"] }
    ]
  })).filePaths[0] || null;
  return e && b.add(o.resolve(e)), e;
});
s.handle("dialog:saveFile", async (t, e) => {
  const n = (await P.showSaveDialog(l, {
    defaultPath: e,
    filters: [{ name: "SRT Subtitle", extensions: ["srt"] }]
  })).filePath || null;
  return n && b.add(o.resolve(n)), n;
});
s.handle("dialog:showMessageBox", async (t, e) => P.showMessageBox(l, e));
s.handle("file:read", async (t, e) => {
  const a = c(e, ...f());
  return v.promises.readFile(a);
});
s.handle("file:readAsDataUrl", async (t, e) => {
  const a = c(e, ...f()), n = await v.promises.readFile(a), i = o.extname(a).toLowerCase().slice(1);
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
  const n = c(e, ...f());
  await v.promises.writeFile(n, a, "utf-8");
});
s.handle("file:getInfo", async (t, e) => {
  const a = c(e, ...f());
  return {
    size: (await v.promises.stat(a)).size,
    path: a,
    name: o.basename(a),
    ext: o.extname(a).toLowerCase()
  };
});
s.handle("file:getTempPath", () => r.getPath("temp"));
s.handle("file:registerPath", (t, e) => {
  typeof e == "string" && b.add(o.resolve(e));
});
s.handle("ffmpeg:extractAudio", async (t, e, a) => {
  const n = c(e, ...f()), i = c(a, ...f());
  return new Promise((d, u) => {
    m(n).audioCodec("flac").toFormat("flac").on("end", () => d(i)).on("error", (w) => u(w.message)).save(i);
  });
});
s.handle("ffmpeg:getDuration", async (t, e) => {
  const a = c(e, ...f());
  return new Promise((n, i) => {
    m.ffprobe(a, (d, u) => {
      d ? i(d.message) : n(u.format.duration || 0);
    });
  });
});
s.handle("ffmpeg:detectSilences", async (t, e, a, n) => {
  const i = c(e, ...f());
  if (!Number.isFinite(a) || a < -100 || a > 0)
    throw new Error("Invalid threshold: must be between -100 and 0");
  if (!Number.isFinite(n) || n < 0.1 || n > 60)
    throw new Error("Invalid minDuration: must be between 0.1 and 60");
  return new Promise((d, u) => {
    const w = [];
    let h = null;
    m(i).audioFilters(`silencedetect=noise=${a}dB:d=${n}`).format("null").on("stderr", (g) => {
      const _ = g.match(/silence_start:\s*([\d.]+)/);
      _ && (h = { start: parseFloat(_[1]) });
      const y = g.match(/silence_end:\s*([\d.]+)/);
      y && h && (h.end = parseFloat(y[1]), w.push(h), h = null);
    }).on("end", () => d(w)).on("error", (g) => u(g.message)).output(process.platform === "win32" ? "NUL" : "/dev/null").run();
  });
});
s.handle("ffmpeg:splitAudio", async (t, e, a) => {
  const n = c(e, ...f()), i = [];
  for (const d of a) {
    const u = c(d.outputPath, ...f());
    await new Promise((w, h) => {
      m(n).setStartTime(d.start).setDuration(d.end - d.start).audioCodec("flac").toFormat("flac").on("end", () => {
        i.push(u), w();
      }).on("error", (g) => h(g.message)).save(u);
    });
  }
  return i;
});
s.handle("app:getVersion", () => r.getVersion());
s.handle("app:checkForUpdates", async () => {
  if (!r.isPackaged) return { updateAvailable: !1 };
  try {
    return { updateAvailable: !!(await p.checkForUpdates())?.updateInfo };
  } catch {
    return { updateAvailable: !1 };
  }
});
s.handle("app:downloadUpdate", async () => {
  r.isPackaged && await p.downloadUpdate();
});
s.handle("app:installUpdate", () => {
  p.quitAndInstall(!1, !0);
});
