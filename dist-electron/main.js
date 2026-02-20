import { protocol as M, app as u, BrowserWindow as j, ipcMain as s, dialog as $, net as k, shell as D, safeStorage as A } from "electron";
import H from "http";
import d from "path";
import S from "fs";
import { fileURLToPath as W } from "url";
import N from "electron-store";
import _ from "fluent-ffmpeg";
import { createRequire as V } from "module";
import B from "electron-updater";
const { autoUpdater: v } = B, R = d.dirname(W(import.meta.url));
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
const x = /* @__PURE__ */ new Set();
function y(o, ...t) {
  if (typeof o != "string") throw new Error("Invalid path: must be a string");
  const e = d.resolve(o);
  if (x.has(e)) return e;
  for (const r of t) {
    const a = d.resolve(r);
    if (e === a || e.startsWith(a + d.sep))
      return e;
  }
  throw new Error("Access denied: path is outside allowed directories");
}
function b() {
  return [
    u.getPath("temp"),
    u.getPath("userData")
  ];
}
const O = ["settings", "recent-files", "subtitle-cache", "subtitle-versions"];
if (u.isPackaged) {
  const o = process.platform === "win32" ? ".exe" : "";
  _.setFfmpegPath(d.join(process.resourcesPath, "ffmpeg", "ffmpeg" + o)), _.setFfprobePath(d.join(process.resourcesPath, "ffprobe", "ffprobe" + o));
} else {
  const o = V(import.meta.url);
  _.setFfmpegPath(o("@ffmpeg-installer/ffmpeg").path), _.setFfprobePath(o("@ffprobe-installer/ffprobe").path);
}
const I = new N();
let h = null;
function U() {
  h = new j({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: d.join(R, "preload.js"),
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !0
    },
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0a0a0f"
  }), h.webContents.setWindowOpenHandler(({ url: o }) => ((o.startsWith("http://") || o.startsWith("https://")) && D.openExternal(o), { action: "deny" })), h.webContents.on("will-navigate", (o, t) => {
    const e = process.env.VITE_DEV_SERVER_URL || "file://";
    t.startsWith(e) || (o.preventDefault(), D.openExternal(t));
  }), process.env.VITE_DEV_SERVER_URL ? (h.loadURL(process.env.VITE_DEV_SERVER_URL), h.webContents.openDevTools()) : h.loadFile(d.join(R, "../dist/index.html"));
}
function K(o) {
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
let E = 0;
function z() {
  const o = H.createServer(async (t, e) => {
    try {
      if (e.setHeader("Access-Control-Allow-Origin", "*"), e.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS"), e.setHeader("Access-Control-Allow-Headers", "Range"), t.method === "OPTIONS") {
        e.writeHead(200), e.end();
        return;
      }
      const r = new URL(t.url || "", `http://localhost:${E}`);
      if (r.pathname !== "/stream") {
        e.writeHead(404), e.end("Not Found");
        return;
      }
      const a = r.searchParams.get("file");
      if (!a) {
        e.writeHead(400), e.end("Missing file parameter");
        return;
      }
      const n = decodeURIComponent(a), f = y(n, ...b()), p = (await S.promises.stat(f)).size, i = t.headers.range, w = K(d.extname(f));
      if (i) {
        const c = i.replace(/bytes=/, "").split("-"), l = parseInt(c[0], 10), m = c[1] ? parseInt(c[1], 10) : p - 1, T = m - l + 1, P = S.createReadStream(f, { start: l, end: m }), F = {
          "Content-Range": `bytes ${l}-${m}/${p}`,
          "Accept-Ranges": "bytes",
          "Content-Length": T,
          "Content-Type": w
        };
        e.writeHead(206, F), P.pipe(e);
      } else {
        const c = {
          "Content-Length": p,
          "Content-Type": w
        };
        e.writeHead(200, c), S.createReadStream(f).pipe(e);
      }
    } catch (r) {
      console.error("Media server error:", r), e.headersSent || (e.writeHead(500), e.end("Internal Server Error"));
    }
  });
  o.listen(0, "127.0.0.1", () => {
    const t = o.address();
    t && typeof t != "string" && (E = t.port, console.log(`Media server listening on port ${E}`));
  });
}
u.whenReady().then(() => {
  z(), M.handle("media", (o) => {
    const t = o.url.replace("media://", "");
    try {
      const e = `http://localhost:${E}/stream?file=${t}`;
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
u.on("window-all-closed", () => {
  process.platform !== "darwin" && u.quit();
});
u.on("before-quit", () => {
  try {
    const o = u.getPath("temp"), t = S.readdirSync(o);
    for (const e of t)
      /^(chunk_\d+\.flac|gap_heal_\d+.*\.flac|subtitles_gen_audio_\d+\.flac)$/.test(e) && S.unlinkSync(d.join(o, e));
  } catch {
  }
});
u.on("activate", () => {
  j.getAllWindows().length === 0 && U();
});
u.isPackaged && (v.autoDownload = !1, v.autoInstallOnAppQuit = !0, u.whenReady().then(() => {
  setTimeout(() => {
    v.checkForUpdates().catch(() => {
    });
  }, 5e3);
}), v.on("update-available", (o) => {
  h?.webContents.send("update-available", {
    version: o.version,
    releaseNotes: o.releaseNotes,
    releaseDate: o.releaseDate
  });
}), v.on("download-progress", (o) => {
  h?.webContents.send("update-download-progress", {
    percent: Math.round(o.percent),
    transferred: o.transferred,
    total: o.total
  });
}), v.on("update-downloaded", (o) => {
  h?.webContents.send("update-downloaded", {
    version: o.version
  });
}), v.on("error", (o) => {
  h?.webContents.send("update-error", o.message);
}));
const C = "enc:";
function q(o) {
  if (!A.isEncryptionAvailable()) return o;
  const t = o.providers;
  if (!t) return o;
  const e = { ...o, providers: { ...t } };
  for (const r of Object.keys(e.providers)) {
    const a = { ...e.providers[r] };
    typeof a.apiKey == "string" && a.apiKey && !a.apiKey.startsWith(C) && (a.apiKey = C + A.encryptString(a.apiKey).toString("base64")), e.providers[r] = a;
  }
  return e;
}
function G(o) {
  if (!A.isEncryptionAvailable()) return o;
  const t = o.providers;
  if (!t) return o;
  const e = { ...o, providers: { ...t } };
  for (const r of Object.keys(e.providers)) {
    const a = { ...e.providers[r] };
    if (typeof a.apiKey == "string" && a.apiKey.startsWith(C))
      try {
        const n = Buffer.from(a.apiKey.slice(C.length), "base64");
        a.apiKey = A.decryptString(n);
      } catch {
      }
    e.providers[r] = a;
  }
  return e;
}
s.handle("store:get", (o, t) => {
  if (typeof t != "string" || !O.includes(t))
    throw new Error(`Invalid store key: ${t}`);
  const e = I.get(t);
  return t === "settings" && e && typeof e == "object" ? G(e) : e;
});
s.handle("store:set", (o, t, e) => {
  if (typeof t != "string" || !O.includes(t))
    throw new Error(`Invalid store key: ${t}`);
  t === "settings" && e && typeof e == "object" ? I.set(t, q(e)) : I.set(t, e);
});
s.handle("store:delete", (o, t) => {
  if (typeof t != "string" || !O.includes(t))
    throw new Error(`Invalid store key: ${t}`);
  I.delete(t);
});
s.handle("dialog:openFile", async () => {
  const t = (await $.showOpenDialog(h, {
    properties: ["openFile"],
    filters: [
      { name: "Media Files", extensions: ["mp4", "mkv", "avi", "mov", "webm", "mp3", "wav", "aac", "m4a", "ogg", "flac"] }
    ]
  })).filePaths[0] || null;
  return t && x.add(d.resolve(t)), t;
});
s.handle("dialog:openSubtitleFile", async () => {
  const t = (await $.showOpenDialog(h, {
    properties: ["openFile"],
    filters: [
      { name: "Subtitle Files", extensions: ["srt", "vtt", "ass", "ssa"] }
    ]
  })).filePaths[0] || null;
  return t && x.add(d.resolve(t)), t;
});
s.handle("dialog:saveFile", async (o, t, e, r) => {
  const n = (await $.showSaveDialog(h, {
    defaultPath: t,
    filters: [{ name: e || "Subtitle File", extensions: r || [t.split(".").pop() || "srt"] }]
  })).filePath || null;
  return n && x.add(d.resolve(n)), n;
});
s.handle("dialog:showMessageBox", async (o, t) => $.showMessageBox(h, t));
s.handle("file:read", async (o, t) => {
  const e = y(t, ...b());
  return S.promises.readFile(e);
});
s.handle("file:write", async (o, t, e) => {
  const r = y(t, ...b());
  await S.promises.writeFile(r, e, "utf-8");
});
s.handle("file:getInfo", async (o, t) => {
  const e = y(t, ...b());
  return {
    size: (await S.promises.stat(e)).size,
    path: e,
    name: d.basename(e),
    ext: d.extname(e).toLowerCase()
  };
});
s.handle("file:getTempPath", () => u.getPath("temp"));
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
  const e = d.resolve(t), r = d.extname(e).toLowerCase();
  if (!J.has(r))
    throw new Error("Only media files can be registered");
  x.add(e);
});
s.handle("ffmpeg:extractAudio", async (o, t, e, r = "flac") => {
  const a = y(t, ...b()), n = y(e, ...b()), f = r === "mp3" ? "libmp3lame" : "flac";
  return new Promise((g, p) => {
    _(a).audioCodec(f).toFormat(r).on("end", () => g(n)).on("error", (i) => p(i.message)).save(n);
  });
});
s.handle("ffmpeg:getDuration", async (o, t) => {
  const e = y(t, ...b());
  return new Promise((r, a) => {
    _.ffprobe(e, (n, f) => {
      n ? a(n.message) : r(f.format.duration || 0);
    });
  });
});
s.handle("ffmpeg:detectSilences", async (o, t, e, r) => {
  const a = y(t, ...b());
  if (!Number.isFinite(e) || e < -100 || e > 0)
    throw new Error("Invalid threshold: must be between -100 and 0");
  if (!Number.isFinite(r) || r < 0.1 || r > 60)
    throw new Error("Invalid minDuration: must be between 0.1 and 60");
  return new Promise((n, f) => {
    const g = [];
    let p = null;
    _(a).audioFilters(`silencedetect=noise=${e}dB:d=${r}`).format("null").on("stderr", (i) => {
      const w = i.match(/silence_start:\s*([\d.]+)/);
      w && (p = { start: parseFloat(w[1]) });
      const c = i.match(/silence_end:\s*([\d.]+)/);
      c && p && (p.end = parseFloat(c[1]), g.push(p), p = null);
    }).on("end", () => n(g)).on("error", (i) => f(i.message)).output(process.platform === "win32" ? "NUL" : "/dev/null").run();
  });
});
s.handle("ffmpeg:splitAudio", async (o, t, e, r = "flac") => {
  const a = y(t, ...b()), n = [], f = r === "mp3" ? "libmp3lame" : "flac";
  for (const g of e) {
    const p = y(g.outputPath, ...b());
    await new Promise((i, w) => {
      _(a).setStartTime(g.start).setDuration(g.end - g.start).audioCodec(f).toFormat(r).on("end", () => {
        n.push(p), i();
      }).on("error", (c) => w(c.message)).save(p);
    });
  }
  return n;
});
s.handle("app:getVersion", () => u.getVersion());
s.handle("app:checkForUpdates", async () => {
  if (!u.isPackaged) return { updateAvailable: !1 };
  try {
    return { updateAvailable: !!(await v.checkForUpdates())?.updateInfo };
  } catch {
    return { updateAvailable: !1 };
  }
});
s.handle("app:downloadUpdate", async () => {
  u.isPackaged && await v.downloadUpdate();
});
s.handle("app:installUpdate", () => {
  v.quitAndInstall(!1, !0);
});
s.handle("ai:testApiKey", async (o, t, e) => {
  try {
    switch (t) {
      case "gemini": {
        const r = await k.fetch(
          "https://generativelanguage.googleapis.com/v1beta/models",
          { headers: { "x-goog-api-key": e } }
        );
        return r.ok ? { ok: !0 } : { ok: !1, error: (await r.json().catch(() => ({}))).error?.message || `HTTP ${r.status}` };
      }
      case "anthropic": {
        const r = await k.fetch("https://api.anthropic.com/v1/messages", {
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
        return r.ok ? { ok: !0 } : { ok: !1, error: (await r.json().catch(() => ({}))).error?.message || `HTTP ${r.status}` };
      }
      case "openai": {
        const r = await k.fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${e}` }
        });
        return r.ok ? { ok: !0 } : { ok: !1, error: (await r.json().catch(() => ({}))).error?.message || `HTTP ${r.status}` };
      }
    }
  } catch (r) {
    return { ok: !1, error: r instanceof Error ? r.message : "Network error" };
  }
});
s.handle("ai:callProvider", async (o, t, e, r, a, n, f = "flac") => {
  const g = `audio/${f}`;
  switch (t) {
    case "gemini": {
      const { GoogleGenerativeAI: p } = await import("./index-C45_meK_.js"), l = await (await new p(e).getGenerativeModel({ model: r }).generateContent([
        a,
        {
          inlineData: {
            mimeType: g,
            data: n
          }
        }
      ])).response, m = l.usageMetadata;
      return {
        text: l.text(),
        tokenUsage: {
          inputTokens: m?.promptTokenCount ?? 0,
          outputTokens: m?.candidatesTokenCount ?? 0,
          provider: "gemini",
          model: r,
          timestamp: Date.now()
        }
      };
    }
    case "openai":
      if (r.startsWith("gpt-4o")) {
        let i = r;
        r === "gpt-4o" ? i = "gpt-4o-audio-preview" : r === "gpt-4o-mini" && (i = "gpt-4o-mini-audio-preview");
        const c = [
          {
            role: "user",
            content: [
              { type: "text", text: a },
              {
                type: "input_audio",
                input_audio: {
                  data: n,
                  format: f === "mp3" ? "mp3" : "wav"
                  // OpenAI supports wav, mp3. 
                }
              }
            ]
          }
        ], l = await k.fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${e}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: i,
            modalities: ["text"],
            // We only want text back
            messages: c
          })
        });
        if (!l.ok) {
          const P = await l.json().catch(() => ({ error: { message: l.statusText } }));
          throw new Error(`OpenAI API error: ${P.error?.message || l.statusText}`);
        }
        const m = await l.json();
        return {
          text: m.choices[0]?.message?.content || "",
          tokenUsage: {
            inputTokens: m.usage?.prompt_tokens || 0,
            outputTokens: m.usage?.completion_tokens || 0,
            provider: "openai",
            model: r,
            timestamp: Date.now()
          }
        };
      } else {
        const i = Buffer.from(n, "base64"), w = new Blob([i], { type: g }), c = new FormData();
        c.append("file", w, `audio.${f}`), c.append("model", "whisper-1"), c.append("response_format", "verbose_json");
        const l = await k.fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${e}`
          },
          body: c
        });
        if (!l.ok) {
          const P = await l.json().catch(() => ({ error: { message: l.statusText } }));
          throw new Error(`OpenAI API error: ${P.error?.message || l.statusText}`);
        }
        const m = await l.json();
        let T = "";
        return m.segments ? T = m.segments.map((P) => {
          const F = Math.floor(P.start / 60).toString().padStart(2, "0"), L = Math.floor(P.start % 60).toString().padStart(2, "0");
          return `[${F}:${L}] ${P.text.trim()}`;
        }).join(`

`) : T = `[00:00] ${m.text}`, {
          text: T,
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
