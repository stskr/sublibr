import { protocol as R, app as h, BrowserWindow as j, ipcMain as s, dialog as O, net as x, shell as D, safeStorage as E } from "electron";
import H from "http";
import f from "path";
import k from "fs";
import { fileURLToPath as W } from "url";
import N from "electron-store";
import T from "fluent-ffmpeg";
import { createRequire as V } from "module";
import B from "electron-updater";
const { autoUpdater: v } = B, F = f.dirname(W(import.meta.url));
R.registerSchemesAsPrivileged([
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
const S = /* @__PURE__ */ new Set();
function y(o, ...t) {
  if (typeof o != "string") throw new Error("Invalid path: must be a string");
  const e = f.resolve(o);
  if (S.has(e)) return e;
  for (const a of t) {
    const n = f.resolve(a);
    if (e === n || e.startsWith(n + f.sep))
      return e;
  }
  throw new Error("Access denied: path is outside allowed directories");
}
function b() {
  return [
    h.getPath("temp"),
    h.getPath("userData")
  ];
}
const M = ["settings", "recent-files", "subtitle-cache", "subtitle-versions"];
if (h.isPackaged) {
  const o = process.platform === "win32" ? ".exe" : "";
  T.setFfmpegPath(f.join(process.resourcesPath, "ffmpeg", "ffmpeg" + o)), T.setFfprobePath(f.join(process.resourcesPath, "ffprobe", "ffprobe" + o));
} else {
  const o = V(import.meta.url);
  T.setFfmpegPath(o("@ffmpeg-installer/ffmpeg").path), T.setFfprobePath(o("@ffprobe-installer/ffprobe").path);
}
const I = new N();
let w = null;
function U() {
  w = new j({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: f.join(F, "preload.js"),
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !0
    },
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0a0a0f"
  }), w.webContents.setWindowOpenHandler(({ url: o }) => ((o.startsWith("http://") || o.startsWith("https://")) && D.openExternal(o), { action: "deny" })), w.webContents.on("will-navigate", (o, t) => {
    const e = process.env.VITE_DEV_SERVER_URL || "file://";
    t.startsWith(e) || (o.preventDefault(), D.openExternal(t));
  }), process.env.VITE_DEV_SERVER_URL ? (w.loadURL(process.env.VITE_DEV_SERVER_URL), w.webContents.openDevTools()) : w.loadFile(f.join(F, "../dist/index.html"));
}
function z(o) {
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
  }[o.toLowerCase()] || "";
}
let A = 0;
function K() {
  const o = H.createServer(async (t, e) => {
    try {
      if (e.setHeader("Access-Control-Allow-Origin", "*"), e.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS"), e.setHeader("Access-Control-Allow-Headers", "Range"), t.method === "OPTIONS") {
        e.writeHead(200), e.end();
        return;
      }
      const a = new URL(t.url || "", `http://localhost:${A}`);
      if (a.pathname !== "/stream") {
        e.writeHead(404), e.end("Not Found");
        return;
      }
      const n = a.searchParams.get("file");
      if (!n) {
        e.writeHead(400), e.end("Missing file parameter");
        return;
      }
      const r = decodeURIComponent(n), l = y(r, ...b()), i = (await k.promises.stat(l)).size, c = t.headers.range, m = z(f.extname(l));
      if (c) {
        const d = c.replace(/bytes=/, "").split("-"), u = parseInt(d[0], 10), g = d[1] ? parseInt(d[1], 10) : i - 1, _ = g - u + 1, P = k.createReadStream(l, { start: u, end: g }), $ = {
          "Content-Range": `bytes ${u}-${g}/${i}`,
          "Accept-Ranges": "bytes",
          "Content-Length": _,
          "Content-Type": m
        };
        e.writeHead(206, $), P.pipe(e);
      } else {
        const d = {
          "Content-Length": i,
          "Content-Type": m
        };
        e.writeHead(200, d), k.createReadStream(l).pipe(e);
      }
    } catch (a) {
      console.error("Media server error:", a), e.headersSent || (e.writeHead(500), e.end("Internal Server Error"));
    }
  });
  o.listen(0, "127.0.0.1", () => {
    const t = o.address();
    t && typeof t != "string" && (A = t.port, console.log(`Media server listening on port ${A}`));
  });
}
h.whenReady().then(() => {
  K(), R.handle("media", (o) => {
    const t = o.url.replace("media://", "");
    try {
      const e = `http://localhost:${A}/stream?file=${t}`;
      return new Response(null, {
        status: 302,
        headers: {
          Location: e
        }
      });
    } catch (e) {
      return console.error("Media protocol error:", e), new Response("Error", { status: 500 });
    }
  }), U();
});
h.on("window-all-closed", () => {
  process.platform !== "darwin" && h.quit();
});
h.on("before-quit", () => {
  try {
    const o = h.getPath("temp"), t = k.readdirSync(o);
    for (const e of t)
      /^(chunk_\d+\.flac|gap_heal_\d+.*\.flac|subtitles_gen_audio_\d+\.flac)$/.test(e) && k.unlinkSync(f.join(o, e));
  } catch {
  }
});
h.on("activate", () => {
  j.getAllWindows().length === 0 && U();
});
h.isPackaged && (v.autoDownload = !1, v.autoInstallOnAppQuit = !0, h.whenReady().then(() => {
  setTimeout(() => {
    v.checkForUpdates().catch(() => {
    });
  }, 5e3);
}), v.on("update-available", (o) => {
  w?.webContents.send("update-available", {
    version: o.version,
    releaseNotes: o.releaseNotes,
    releaseDate: o.releaseDate
  });
}), v.on("download-progress", (o) => {
  w?.webContents.send("update-download-progress", {
    percent: Math.round(o.percent),
    transferred: o.transferred,
    total: o.total
  });
}), v.on("update-downloaded", (o) => {
  w?.webContents.send("update-downloaded", {
    version: o.version
  });
}), v.on("error", (o) => {
  w?.webContents.send("update-error", o.message);
}));
const C = "enc:";
function G(o) {
  if (!E.isEncryptionAvailable()) return o;
  const t = o.providers;
  if (!t) return o;
  const e = { ...o, providers: { ...t } };
  for (const a of Object.keys(e.providers)) {
    const n = { ...e.providers[a] };
    typeof n.apiKey == "string" && n.apiKey && !n.apiKey.startsWith(C) && (n.apiKey = C + E.encryptString(n.apiKey).toString("base64")), e.providers[a] = n;
  }
  return e;
}
function q(o) {
  if (!E.isEncryptionAvailable()) return o;
  const t = o.providers;
  if (!t) return o;
  const e = { ...o, providers: { ...t } };
  for (const a of Object.keys(e.providers)) {
    const n = { ...e.providers[a] };
    if (typeof n.apiKey == "string" && n.apiKey.startsWith(C))
      try {
        const r = Buffer.from(n.apiKey.slice(C.length), "base64");
        n.apiKey = E.decryptString(r);
      } catch {
      }
    e.providers[a] = n;
  }
  return e;
}
s.handle("store:get", (o, t) => {
  if (typeof t != "string" || !M.includes(t))
    throw new Error(`Invalid store key: ${t}`);
  const e = I.get(t);
  return t === "settings" && e && typeof e == "object" ? q(e) : e;
});
s.handle("store:set", (o, t, e) => {
  if (typeof t != "string" || !M.includes(t))
    throw new Error(`Invalid store key: ${t}`);
  t === "settings" && e && typeof e == "object" ? I.set(t, G(e)) : I.set(t, e);
});
s.handle("store:delete", (o, t) => {
  if (typeof t != "string" || !M.includes(t))
    throw new Error(`Invalid store key: ${t}`);
  I.delete(t);
});
s.handle("dialog:openFile", async () => {
  const t = (await O.showOpenDialog(w, {
    properties: ["openFile"],
    filters: [
      { name: "Media Files", extensions: ["mp4", "mkv", "avi", "mov", "webm", "mp3", "wav", "aac", "m4a", "ogg", "flac"] }
    ]
  })).filePaths[0] || null;
  return t && S.add(f.resolve(t)), t;
});
s.handle("dialog:openSubtitleFile", async () => {
  const t = (await O.showOpenDialog(w, {
    properties: ["openFile"],
    filters: [
      { name: "Subtitle Files", extensions: ["srt", "vtt", "ass", "ssa"] }
    ]
  })).filePaths[0] || null;
  return t && S.add(f.resolve(t)), t;
});
s.handle("dialog:saveFile", async (o, t, e, a) => {
  const r = (await O.showSaveDialog(w, {
    defaultPath: t,
    filters: [{ name: e || "Subtitle File", extensions: a || [t.split(".").pop() || "srt"] }]
  })).filePath || null;
  return r && S.add(f.resolve(r)), r;
});
s.handle("dialog:showMessageBox", async (o, t) => O.showMessageBox(w, t));
s.handle("file:read", async (o, t) => {
  const e = y(t, ...b());
  return k.promises.readFile(e);
});
s.handle("file:write", async (o, t, e) => {
  const a = y(t, ...b());
  await k.promises.writeFile(a, e, "utf-8");
});
s.handle("file:getInfo", async (o, t) => {
  const e = y(t, ...b());
  return {
    size: (await k.promises.stat(e)).size,
    path: e,
    name: f.basename(e),
    ext: f.extname(e).toLowerCase()
  };
});
s.handle("file:getTempPath", () => h.getPath("temp"));
const J = /* @__PURE__ */ new Set([
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
s.handle("file:registerPath", (o, t) => {
  if (typeof t != "string") return;
  const e = f.resolve(t), a = f.extname(e).toLowerCase();
  if (!J.has(a))
    throw new Error("Only media files can be registered");
  S.add(e);
});
s.handle("ffmpeg:extractAudio", async (o, t, e, a = "flac") => {
  const n = y(t, ...b()), r = y(e, ...b()), l = a === "mp3" ? "libmp3lame" : "flac";
  return new Promise((p, i) => {
    T(n).audioCodec(l).toFormat(a).on("end", () => p(r)).on("error", (c) => i(c.message)).save(r);
  });
});
s.handle("ffmpeg:getDuration", async (o, t) => {
  const e = y(t, ...b());
  return new Promise((a, n) => {
    T.ffprobe(e, (r, l) => {
      r ? n(r.message) : a(l.format.duration || 0);
    });
  });
});
s.handle("ffmpeg:detectSilences", async (o, t, e, a) => {
  const n = y(t, ...b());
  if (!Number.isFinite(e) || e < -100 || e > 0)
    throw new Error("Invalid threshold: must be between -100 and 0");
  if (!Number.isFinite(a) || a < 0.1 || a > 60)
    throw new Error("Invalid minDuration: must be between 0.1 and 60");
  return new Promise((r, l) => {
    const p = [];
    let i = null;
    T(n).audioFilters(`silencedetect=noise=${e}dB:d=${a}`).format("null").on("stderr", (c) => {
      const m = c.match(/silence_start:\s*([\d.]+)/);
      m && (i = { start: parseFloat(m[1]) });
      const d = c.match(/silence_end:\s*([\d.]+)/);
      d && i && (i.end = parseFloat(d[1]), p.push(i), i = null);
    }).on("end", () => r(p)).on("error", (c) => l(c.message)).output(process.platform === "win32" ? "NUL" : "/dev/null").run();
  });
});
s.handle("ffmpeg:splitAudio", async (o, t, e, a = "flac") => {
  const n = y(t, ...b()), r = [], l = a === "mp3" ? "libmp3lame" : "flac";
  for (const p of e) {
    const i = y(p.outputPath, ...b());
    await new Promise((c, m) => {
      T(n).setStartTime(p.start).setDuration(p.end - p.start).audioCodec(l).toFormat(a).on("end", () => {
        r.push(i), c();
      }).on("error", (d) => m(d.message)).save(i);
    });
  }
  return r;
});
s.handle("app:getVersion", () => h.getVersion());
s.handle("app:checkForUpdates", async () => {
  if (!h.isPackaged) return { updateAvailable: !1 };
  try {
    return { updateAvailable: !!(await v.checkForUpdates())?.updateInfo };
  } catch {
    return { updateAvailable: !1 };
  }
});
s.handle("app:downloadUpdate", async () => {
  h.isPackaged && await v.downloadUpdate();
});
s.handle("app:installUpdate", () => {
  v.quitAndInstall(!1, !0);
});
s.handle("ai:testApiKey", async (o, t, e) => {
  try {
    switch (t) {
      case "gemini": {
        const a = await x.fetch(
          "https://generativelanguage.googleapis.com/v1beta/models",
          { headers: { "x-goog-api-key": e } }
        );
        return a.ok ? { ok: !0 } : { ok: !1, error: (await a.json().catch(() => ({}))).error?.message || `HTTP ${a.status}` };
      }
      case "anthropic": {
        const a = await x.fetch("https://api.anthropic.com/v1/messages", {
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
        const a = await x.fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${e}` }
        });
        return a.ok ? { ok: !0 } : { ok: !1, error: (await a.json().catch(() => ({}))).error?.message || `HTTP ${a.status}` };
      }
    }
  } catch (a) {
    return { ok: !1, error: a instanceof Error ? a.message : "Network error" };
  }
});
s.handle("ai:callProvider", async (o, t, e, a, n, r, l = "flac") => {
  const p = `audio/${l}`;
  switch (t) {
    case "gemini": {
      const { GoogleGenerativeAI: i } = await import("./index-C45_meK_.js"), u = await (await new i(e).getGenerativeModel({ model: a }).generateContent([
        n,
        {
          inlineData: {
            mimeType: p,
            data: r
          }
        }
      ])).response, g = u.usageMetadata;
      return {
        text: u.text(),
        tokenUsage: {
          inputTokens: g?.promptTokenCount ?? 0,
          outputTokens: g?.candidatesTokenCount ?? 0,
          provider: "gemini",
          model: a,
          timestamp: Date.now()
        }
      };
    }
    case "openai":
      if (a.startsWith("gpt-4o")) {
        let c = a;
        a === "gpt-4o" ? c = "gpt-4o-audio-preview" : a === "gpt-4o-mini" && (c = "gpt-4o-mini-audio-preview");
        const d = [
          {
            role: "user",
            content: [
              { type: "text", text: n },
              {
                type: "input_audio",
                input_audio: {
                  data: r,
                  format: l === "mp3" ? "mp3" : "wav"
                  // OpenAI supports wav, mp3. 
                }
              }
            ]
          }
        ], u = await x.fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${e}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: c,
            modalities: ["text"],
            // We only want text back
            messages: d
          })
        });
        if (!u.ok) {
          const P = await u.json().catch(() => ({ error: { message: u.statusText } }));
          throw new Error(`OpenAI API error: ${P.error?.message || u.statusText}`);
        }
        const g = await u.json();
        return {
          text: g.choices[0]?.message?.content || "",
          tokenUsage: {
            inputTokens: g.usage?.prompt_tokens || 0,
            outputTokens: g.usage?.completion_tokens || 0,
            provider: "openai",
            model: a,
            timestamp: Date.now()
          }
        };
      } else {
        const c = Buffer.from(r, "base64"), m = new Blob([c], { type: p }), d = new FormData();
        d.append("file", m, `audio.${l}`), d.append("model", "whisper-1"), d.append("response_format", "verbose_json");
        const u = await x.fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${e}`
          },
          body: d
        });
        if (!u.ok) {
          const P = await u.json().catch(() => ({ error: { message: u.statusText } }));
          throw new Error(`OpenAI API error: ${P.error?.message || u.statusText}`);
        }
        const g = await u.json();
        let _ = "";
        return g.segments ? _ = g.segments.map((P) => {
          const $ = Math.floor(P.start / 60).toString().padStart(2, "0"), L = Math.floor(P.start % 60).toString().padStart(2, "0");
          return `[${$}:${L}] ${P.text.trim()}`;
        }).join(`

`) : _ = `[00:00] ${g.text}`, {
          text: _,
          tokenUsage: {
            inputTokens: 0,
            outputTokens: 0,
            provider: "openai",
            model: "whisper-1",
            timestamp: Date.now()
          }
        };
      }
  }
});
s.handle("ai:callTextProvider", async (o, t, e, a, n) => {
  switch (t) {
    case "gemini": {
      const { GoogleGenerativeAI: r } = await import("./index-C45_meK_.js"), c = await (await new r(e).getGenerativeModel({ model: a }).generateContent(n)).response, m = c.usageMetadata;
      return {
        text: c.text(),
        tokenUsage: {
          inputTokens: m?.promptTokenCount ?? 0,
          outputTokens: m?.candidatesTokenCount ?? 0,
          provider: "gemini",
          model: a,
          timestamp: Date.now()
        }
      };
    }
    case "openai": {
      let r = a;
      a === "gpt-4o-audio-preview" && (r = "gpt-4o"), a === "gpt-4o-mini-audio-preview" && (r = "gpt-4o-mini");
      const l = [
        {
          role: "user",
          content: n
        }
      ], p = await x.fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${e}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: r,
          messages: l
        })
      });
      if (!p.ok) {
        const m = await p.json().catch(() => ({ error: { message: p.statusText } }));
        throw new Error(`OpenAI API error: ${m.error?.message || p.statusText}`);
      }
      const i = await p.json();
      return {
        text: i.choices[0]?.message?.content || "",
        tokenUsage: {
          inputTokens: i.usage?.prompt_tokens || 0,
          outputTokens: i.usage?.completion_tokens || 0,
          provider: "openai",
          model: a,
          timestamp: Date.now()
        }
      };
    }
  }
});
