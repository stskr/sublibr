import { protocol as M, app as p, BrowserWindow as U, ipcMain as n, dialog as C, net as T, shell as D, safeStorage as A } from "electron";
import L from "http";
import l from "path";
import S from "fs";
import { fileURLToPath as H } from "url";
import W from "electron-store";
import P from "fluent-ffmpeg";
import { createRequire as N } from "module";
import V from "electron-updater";
const { autoUpdater: v } = V, O = l.dirname(H(import.meta.url));
M.registerSchemesAsPrivileged([
  {
    scheme: "media",
    privileges: {
      secure: !0,
      supportFetchAPI: !0,
      bypassCSP: !0,
      stream: !0
    }
  }
]);
const E = /* @__PURE__ */ new Set();
function b(r, ...t) {
  if (typeof r != "string") throw new Error("Invalid path: must be a string");
  const e = l.resolve(r);
  if (E.has(e)) return e;
  for (const a of t) {
    const o = l.resolve(a);
    if (e === o || e.startsWith(o + l.sep))
      return e;
  }
  throw new Error("Access denied: path is outside allowed directories");
}
function y() {
  return [
    p.getPath("temp"),
    p.getPath("userData")
  ];
}
const R = ["settings", "recent-files", "subtitle-cache", "subtitle-versions"];
if (p.isPackaged) {
  const r = process.platform === "win32" ? ".exe" : "";
  P.setFfmpegPath(l.join(process.resourcesPath, "ffmpeg", "ffmpeg" + r)), P.setFfprobePath(l.join(process.resourcesPath, "ffprobe", "ffprobe" + r));
} else {
  const r = N(import.meta.url);
  P.setFfmpegPath(r("@ffmpeg-installer/ffmpeg").path), P.setFfprobePath(r("@ffprobe-installer/ffprobe").path);
}
const x = new W();
let u = null;
function j() {
  u = new U({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: l.join(O, "preload.js"),
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !0
    },
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0a0a0f"
  }), u.webContents.setWindowOpenHandler(({ url: r }) => ((r.startsWith("http://") || r.startsWith("https://")) && D.openExternal(r), { action: "deny" })), u.webContents.on("will-navigate", (r, t) => {
    const e = process.env.VITE_DEV_SERVER_URL || "file://";
    t.startsWith(e) || (r.preventDefault(), D.openExternal(t));
  }), process.env.VITE_DEV_SERVER_URL ? (u.loadURL(process.env.VITE_DEV_SERVER_URL), u.webContents.openDevTools()) : u.loadFile(l.join(O, "../dist/index.html"));
}
function K(r) {
  return {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".wma": "audio/x-ms-wma",
    ".alac": "audio/alac",
    ".aiff": "audio/x-aiff",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".ts": "video/mp2t",
    ".mts": "video/mp2t",
    ".m2ts": "video/mp2t"
  }[r.toLowerCase()] || "";
}
let k = 0;
function B() {
  const r = L.createServer(async (t, e) => {
    try {
      if (e.setHeader("Access-Control-Allow-Origin", "*"), e.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS"), e.setHeader("Access-Control-Allow-Headers", "Range"), t.method === "OPTIONS") {
        e.writeHead(200), e.end();
        return;
      }
      const a = new URL(t.url || "", `http://localhost:${k}`);
      if (a.pathname !== "/stream") {
        e.writeHead(404), e.end("Not Found");
        return;
      }
      const o = a.searchParams.get("file");
      if (!o) {
        e.writeHead(400), e.end("Missing file parameter");
        return;
      }
      const s = decodeURIComponent(o), d = b(s, ...y()), i = (await S.promises.stat(d)).size, f = t.headers.range, h = K(l.extname(d));
      if (f) {
        const c = f.replace(/bytes=/, "").split("-"), w = parseInt(c[0], 10), g = c[1] ? parseInt(c[1], 10) : i - 1, _ = g - w + 1, F = S.createReadStream(d, { start: w, end: g }), $ = {
          "Content-Range": `bytes ${w}-${g}/${i}`,
          "Accept-Ranges": "bytes",
          "Content-Length": _,
          "Content-Type": h
        };
        e.writeHead(206, $), F.pipe(e);
      } else {
        const c = {
          "Content-Length": i,
          "Content-Type": h
        };
        e.writeHead(200, c), S.createReadStream(d).pipe(e);
      }
    } catch (a) {
      console.error("Media server error:", a), e.headersSent || (e.writeHead(500), e.end("Internal Server Error"));
    }
  });
  r.listen(0, "127.0.0.1", () => {
    const t = r.address();
    t && typeof t != "string" && (k = t.port, console.log(`Media server listening on port ${k}`));
  });
}
p.whenReady().then(() => {
  B(), M.handle("media", (r) => {
    const t = r.url.replace("media://", "");
    try {
      const e = `http://localhost:${k}/stream?file=${t}`;
      return new Response(null, {
        status: 302,
        headers: {
          Location: e
        }
      });
    } catch (e) {
      return console.error("Media protocol error:", e), new Response("Error", { status: 500 });
    }
  }), j();
});
p.on("window-all-closed", () => {
  process.platform !== "darwin" && p.quit();
});
p.on("before-quit", () => {
  try {
    const r = p.getPath("temp"), t = S.readdirSync(r);
    for (const e of t)
      /^(chunk_\d+\.flac|gap_heal_\d+.*\.flac|subtitles_gen_audio_\d+\.flac)$/.test(e) && S.unlinkSync(l.join(r, e));
  } catch {
  }
});
p.on("activate", () => {
  U.getAllWindows().length === 0 && j();
});
p.isPackaged && (v.autoDownload = !1, v.autoInstallOnAppQuit = !0, p.whenReady().then(() => {
  setTimeout(() => {
    v.checkForUpdates().catch(() => {
    });
  }, 5e3);
}), v.on("update-available", (r) => {
  u?.webContents.send("update-available", {
    version: r.version,
    releaseNotes: r.releaseNotes,
    releaseDate: r.releaseDate
  });
}), v.on("download-progress", (r) => {
  u?.webContents.send("update-download-progress", {
    percent: Math.round(r.percent),
    transferred: r.transferred,
    total: r.total
  });
}), v.on("update-downloaded", (r) => {
  u?.webContents.send("update-downloaded", {
    version: r.version
  });
}), v.on("error", (r) => {
  u?.webContents.send("update-error", r.message);
}));
const I = "enc:";
function z(r) {
  if (!A.isEncryptionAvailable()) return r;
  const t = r.providers;
  if (!t) return r;
  const e = { ...r, providers: { ...t } };
  for (const a of Object.keys(e.providers)) {
    const o = { ...e.providers[a] };
    typeof o.apiKey == "string" && o.apiKey && !o.apiKey.startsWith(I) && (o.apiKey = I + A.encryptString(o.apiKey).toString("base64")), e.providers[a] = o;
  }
  return e;
}
function q(r) {
  if (!A.isEncryptionAvailable()) return r;
  const t = r.providers;
  if (!t) return r;
  const e = { ...r, providers: { ...t } };
  for (const a of Object.keys(e.providers)) {
    const o = { ...e.providers[a] };
    if (typeof o.apiKey == "string" && o.apiKey.startsWith(I))
      try {
        const s = Buffer.from(o.apiKey.slice(I.length), "base64");
        o.apiKey = A.decryptString(s);
      } catch {
      }
    e.providers[a] = o;
  }
  return e;
}
n.handle("store:get", (r, t) => {
  if (typeof t != "string" || !R.includes(t))
    throw new Error(`Invalid store key: ${t}`);
  const e = x.get(t);
  return t === "settings" && e && typeof e == "object" ? q(e) : e;
});
n.handle("store:set", (r, t, e) => {
  if (typeof t != "string" || !R.includes(t))
    throw new Error(`Invalid store key: ${t}`);
  t === "settings" && e && typeof e == "object" ? x.set(t, z(e)) : x.set(t, e);
});
n.handle("store:delete", (r, t) => {
  if (typeof t != "string" || !R.includes(t))
    throw new Error(`Invalid store key: ${t}`);
  x.delete(t);
});
n.handle("dialog:openFile", async () => {
  const t = (await C.showOpenDialog(u, {
    properties: ["openFile"],
    filters: [
      { name: "Media Files", extensions: ["mp4", "mkv", "avi", "mov", "webm", "mp3", "wav", "aac", "m4a", "ogg", "flac"] }
    ]
  })).filePaths[0] || null;
  return t && E.add(l.resolve(t)), t;
});
n.handle("dialog:openSubtitleFile", async () => {
  const t = (await C.showOpenDialog(u, {
    properties: ["openFile"],
    filters: [
      { name: "Subtitle Files", extensions: ["srt", "vtt", "ass", "ssa"] }
    ]
  })).filePaths[0] || null;
  return t && E.add(l.resolve(t)), t;
});
n.handle("dialog:saveFile", async (r, t, e, a) => {
  const s = (await C.showSaveDialog(u, {
    defaultPath: t,
    filters: [{ name: e || "Subtitle File", extensions: a || [t.split(".").pop() || "srt"] }]
  })).filePath || null;
  return s && E.add(l.resolve(s)), s;
});
n.handle("dialog:showMessageBox", async (r, t) => C.showMessageBox(u, t));
n.handle("file:read", async (r, t) => {
  const e = b(t, ...y());
  return S.promises.readFile(e);
});
n.handle("file:write", async (r, t, e) => {
  const a = b(t, ...y());
  await S.promises.writeFile(a, e, "utf-8");
});
n.handle("file:getInfo", async (r, t) => {
  const e = b(t, ...y());
  return {
    size: (await S.promises.stat(e)).size,
    path: e,
    name: l.basename(e),
    ext: l.extname(e).toLowerCase()
  };
});
n.handle("file:getTempPath", () => p.getPath("temp"));
const G = /* @__PURE__ */ new Set([
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
n.handle("file:registerPath", (r, t) => {
  if (typeof t != "string") return;
  const e = l.resolve(t), a = l.extname(e).toLowerCase();
  if (!G.has(a))
    throw new Error("Only media files can be registered");
  E.add(e);
});
n.handle("ffmpeg:extractAudio", async (r, t, e, a = "flac") => {
  const o = b(t, ...y()), s = b(e, ...y()), d = a === "mp3" ? "libmp3lame" : "flac";
  return new Promise((m, i) => {
    P(o).audioCodec(d).toFormat(a).on("end", () => m(s)).on("error", (f) => i(f.message)).save(s);
  });
});
n.handle("ffmpeg:getDuration", async (r, t) => {
  const e = b(t, ...y());
  return new Promise((a, o) => {
    P.ffprobe(e, (s, d) => {
      s ? o(s.message) : a(d.format.duration || 0);
    });
  });
});
n.handle("ffmpeg:detectSilences", async (r, t, e, a) => {
  const o = b(t, ...y());
  if (!Number.isFinite(e) || e < -100 || e > 0)
    throw new Error("Invalid threshold: must be between -100 and 0");
  if (!Number.isFinite(a) || a < 0.1 || a > 60)
    throw new Error("Invalid minDuration: must be between 0.1 and 60");
  return new Promise((s, d) => {
    const m = [];
    let i = null;
    P(o).audioFilters(`silencedetect=noise=${e}dB:d=${a}`).format("null").on("stderr", (f) => {
      const h = f.match(/silence_start:\s*([\d.]+)/);
      h && (i = { start: parseFloat(h[1]) });
      const c = f.match(/silence_end:\s*([\d.]+)/);
      c && i && (i.end = parseFloat(c[1]), m.push(i), i = null);
    }).on("end", () => s(m)).on("error", (f) => d(f.message)).output(process.platform === "win32" ? "NUL" : "/dev/null").run();
  });
});
n.handle("ffmpeg:splitAudio", async (r, t, e, a = "flac") => {
  const o = b(t, ...y()), s = [], d = a === "mp3" ? "libmp3lame" : "flac";
  for (const m of e) {
    const i = b(m.outputPath, ...y());
    await new Promise((f, h) => {
      P(o).setStartTime(m.start).setDuration(m.end - m.start).audioCodec(d).toFormat(a).on("end", () => {
        s.push(i), f();
      }).on("error", (c) => h(c.message)).save(i);
    });
  }
  return s;
});
n.handle("app:getVersion", () => p.getVersion());
n.handle("app:checkForUpdates", async () => {
  if (!p.isPackaged) return { updateAvailable: !1 };
  try {
    return { updateAvailable: !!(await v.checkForUpdates())?.updateInfo };
  } catch {
    return { updateAvailable: !1 };
  }
});
n.handle("app:downloadUpdate", async () => {
  p.isPackaged && await v.downloadUpdate();
});
n.handle("app:installUpdate", () => {
  v.quitAndInstall(!1, !0);
});
n.handle("ai:testApiKey", async (r, t, e) => {
  try {
    switch (t) {
      case "gemini": {
        const a = await T.fetch(
          "https://generativelanguage.googleapis.com/v1beta/models",
          { headers: { "x-goog-api-key": e } }
        );
        return a.ok ? { ok: !0 } : { ok: !1, error: (await a.json().catch(() => ({}))).error?.message || `HTTP ${a.status}` };
      }
      case "anthropic": {
        const a = await T.fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": e,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 1,
            messages: [{ role: "user", content: "ping" }]
          })
        });
        return a.ok ? { ok: !0 } : { ok: !1, error: (await a.json().catch(() => ({}))).error?.message || `HTTP ${a.status}` };
      }
      case "openai": {
        const a = await T.fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${e}` }
        });
        return a.ok ? { ok: !0 } : { ok: !1, error: (await a.json().catch(() => ({}))).error?.message || `HTTP ${a.status}` };
      }
    }
  } catch (a) {
    return { ok: !1, error: a instanceof Error ? a.message : "Network error" };
  }
});
n.handle("ai:callProvider", async (r, t, e, a, o, s, d = "flac") => {
  const m = `audio/${d}`;
  switch (t) {
    case "gemini": {
      const { GoogleGenerativeAI: i } = await import("./index-C45_meK_.js"), w = await (await new i(e).getGenerativeModel({ model: a }).generateContent([
        o,
        {
          inlineData: {
            mimeType: m,
            data: s
          }
        }
      ])).response, g = w.usageMetadata;
      return {
        text: w.text(),
        tokenUsage: {
          inputTokens: g?.promptTokenCount ?? 0,
          outputTokens: g?.candidatesTokenCount ?? 0,
          provider: "gemini",
          model: a,
          timestamp: Date.now()
        }
      };
    }
    case "openai": {
      const i = Buffer.from(s, "base64"), f = new Blob([i], { type: m }), h = new FormData();
      h.append("file", f, `audio.${d}`), h.append("model", "whisper-1"), h.append("response_format", "verbose_json");
      const c = await T.fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${e}`
        },
        body: h
      });
      if (!c.ok) {
        const _ = await c.json().catch(() => ({ error: { message: c.statusText } }));
        throw new Error(`OpenAI API error: ${_.error?.message || c.statusText}`);
      }
      const w = await c.json();
      let g = "";
      return w.segments ? g = w.segments.map((_) => {
        const F = Math.floor(_.start / 60).toString().padStart(2, "0"), $ = Math.floor(_.start % 60).toString().padStart(2, "0");
        return `[${F}:${$}] ${_.text.trim()}`;
      }).join(`

`) : g = `[00:00] ${w.text}`, {
        text: g,
        tokenUsage: {
          inputTokens: 0,
          // Whisper doesn't report traditional token usage in the same way
          outputTokens: 0,
          provider: "openai",
          model: "whisper-1",
          timestamp: Date.now()
        }
      };
    }
  }
});
