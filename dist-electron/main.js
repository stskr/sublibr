import { protocol as U, app as m, BrowserWindow as j, ipcMain as s, dialog as F, net as x, shell as D, safeStorage as I } from "electron";
import L from "http";
import u from "path";
import _ from "fs";
import { fileURLToPath as N } from "url";
import W from "electron-store";
import T from "fluent-ffmpeg";
import { createRequire as V } from "module";
import B from "electron-updater";
const z = "Transcribe accurately. Use proper punctuation. For example: Hello, world! How are you doing today?", { autoUpdater: y } = B, R = u.dirname(N(import.meta.url));
U.registerSchemesAsPrivileged([
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
const A = /* @__PURE__ */ new Set();
function b(o, ...t) {
  if (typeof o != "string") throw new Error("Invalid path: must be a string");
  const e = u.resolve(o);
  if (A.has(e)) return e;
  for (const a of t) {
    const n = u.resolve(a);
    if (e === n || e.startsWith(n + u.sep))
      return e;
  }
  throw new Error("Access denied: path is outside allowed directories");
}
function P() {
  return [
    m.getPath("temp"),
    m.getPath("userData")
  ];
}
const $ = ["settings", "recent-files", "subtitle-cache", "subtitle-versions"];
if (m.isPackaged) {
  const o = process.platform === "win32" ? ".exe" : "";
  T.setFfmpegPath(u.join(process.resourcesPath, "ffmpeg", "ffmpeg" + o)), T.setFfprobePath(u.join(process.resourcesPath, "ffprobe", "ffprobe" + o));
} else {
  const o = V(import.meta.url);
  T.setFfmpegPath(o("@ffmpeg-installer/ffmpeg").path), T.setFfprobePath(o("@ffprobe-installer/ffprobe").path);
}
const C = new W();
let v = null;
function H() {
  v = new j({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: u.join(R, "preload.js"),
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !0
    },
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0a0a0f"
  }), v.webContents.setWindowOpenHandler(({ url: o }) => ((o.startsWith("http://") || o.startsWith("https://")) && D.openExternal(o), { action: "deny" })), v.webContents.on("will-navigate", (o, t) => {
    const e = process.env.VITE_DEV_SERVER_URL || "file://";
    t.startsWith(e) || (o.preventDefault(), D.openExternal(t));
  }), process.env.VITE_DEV_SERVER_URL ? (v.loadURL(process.env.VITE_DEV_SERVER_URL), v.webContents.openDevTools()) : v.loadFile(u.join(R, "../dist/index.html"));
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
function G() {
  const o = L.createServer(async (t, e) => {
    try {
      if (e.setHeader("Access-Control-Allow-Origin", "*"), e.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS"), e.setHeader("Access-Control-Allow-Headers", "Range"), t.method === "OPTIONS") {
        e.writeHead(200), e.end();
        return;
      }
      const a = new URL(t.url || "", `http://localhost:${E}`);
      if (a.pathname !== "/stream") {
        e.writeHead(404), e.end("Not Found");
        return;
      }
      const n = a.searchParams.get("file");
      if (!n) {
        e.writeHead(400), e.end("Missing file parameter");
        return;
      }
      const r = decodeURIComponent(n), p = b(r, ...P()), i = (await _.promises.stat(p)).size, l = t.headers.range, f = K(u.extname(p));
      if (l) {
        const d = l.replace(/bytes=/, "").split("-"), k = parseInt(d[0], 10), h = d[1] ? parseInt(d[1], 10) : i - 1, g = h - k + 1, w = _.createReadStream(p, { start: k, end: h }), S = {
          "Content-Range": `bytes ${k}-${h}/${i}`,
          "Accept-Ranges": "bytes",
          "Content-Length": g,
          "Content-Type": f
        };
        e.writeHead(206, S), w.pipe(e);
      } else {
        const d = {
          "Content-Length": i,
          "Content-Type": f
        };
        e.writeHead(200, d), _.createReadStream(p).pipe(e);
      }
    } catch (a) {
      console.error("Media server error:", a), e.headersSent || (e.writeHead(500), e.end("Internal Server Error"));
    }
  });
  o.listen(0, "127.0.0.1", () => {
    const t = o.address();
    t && typeof t != "string" && (E = t.port, console.log(`Media server listening on port ${E}`));
  });
}
m.whenReady().then(() => {
  G(), U.handle("media", (o) => {
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
  }), H();
});
m.on("window-all-closed", () => {
  process.platform !== "darwin" && m.quit();
});
m.on("before-quit", () => {
  try {
    const o = m.getPath("temp"), t = _.readdirSync(o);
    for (const e of t)
      /^(chunk_\d+\.flac|gap_heal_\d+.*\.flac|subtitles_gen_audio_\d+\.flac)$/.test(e) && _.unlinkSync(u.join(o, e));
  } catch {
  }
});
m.on("activate", () => {
  j.getAllWindows().length === 0 && H();
});
m.isPackaged && (y.autoDownload = !1, y.autoInstallOnAppQuit = !0, m.whenReady().then(() => {
  setTimeout(() => {
    y.checkForUpdates().catch(() => {
    });
  }, 5e3);
}), y.on("update-available", (o) => {
  v?.webContents.send("update-available", {
    version: o.version,
    releaseNotes: o.releaseNotes,
    releaseDate: o.releaseDate
  });
}), y.on("download-progress", (o) => {
  v?.webContents.send("update-download-progress", {
    percent: Math.round(o.percent),
    transferred: o.transferred,
    total: o.total
  });
}), y.on("update-downloaded", (o) => {
  v?.webContents.send("update-downloaded", {
    version: o.version
  });
}), y.on("error", (o) => {
  v?.webContents.send("update-error", o.message);
}));
const O = "enc:";
function q(o) {
  if (!I.isEncryptionAvailable()) return o;
  const t = o.providers;
  if (!t) return o;
  const e = { ...o, providers: { ...t } };
  for (const a of Object.keys(e.providers)) {
    const n = { ...e.providers[a] };
    typeof n.apiKey == "string" && n.apiKey && !n.apiKey.startsWith(O) && (n.apiKey = O + I.encryptString(n.apiKey).toString("base64")), e.providers[a] = n;
  }
  return e;
}
function J(o) {
  if (!I.isEncryptionAvailable()) return o;
  const t = o.providers;
  if (!t) return o;
  const e = { ...o, providers: { ...t } };
  for (const a of Object.keys(e.providers)) {
    const n = { ...e.providers[a] };
    if (typeof n.apiKey == "string" && n.apiKey.startsWith(O))
      try {
        const r = Buffer.from(n.apiKey.slice(O.length), "base64");
        n.apiKey = I.decryptString(r);
      } catch {
      }
    e.providers[a] = n;
  }
  return e;
}
s.handle("store:get", (o, t) => {
  if (typeof t != "string" || !$.includes(t))
    throw new Error(`Invalid store key: ${t}`);
  const e = C.get(t);
  return t === "settings" && e && typeof e == "object" ? J(e) : e;
});
s.handle("store:set", (o, t, e) => {
  if (typeof t != "string" || !$.includes(t))
    throw new Error(`Invalid store key: ${t}`);
  t === "settings" && e && typeof e == "object" ? C.set(t, q(e)) : C.set(t, e);
});
s.handle("store:delete", (o, t) => {
  if (typeof t != "string" || !$.includes(t))
    throw new Error(`Invalid store key: ${t}`);
  C.delete(t);
});
s.handle("dialog:openFile", async () => {
  const t = (await F.showOpenDialog(v, {
    properties: ["openFile"],
    filters: [
      { name: "Media Files", extensions: ["mp4", "mkv", "avi", "mov", "webm", "mp3", "wav", "aac", "m4a", "ogg", "flac"] }
    ]
  })).filePaths[0] || null;
  return t && A.add(u.resolve(t)), t;
});
s.handle("dialog:openSubtitleFile", async () => {
  const t = (await F.showOpenDialog(v, {
    properties: ["openFile"],
    filters: [
      { name: "Subtitle Files", extensions: ["srt", "vtt", "ass", "ssa"] }
    ]
  })).filePaths[0] || null;
  return t && A.add(u.resolve(t)), t;
});
s.handle("dialog:saveFile", async (o, t, e, a) => {
  const r = (await F.showSaveDialog(v, {
    defaultPath: t,
    filters: [{ name: e || "Subtitle File", extensions: a || [t.split(".").pop() || "srt"] }]
  })).filePath || null;
  return r && A.add(u.resolve(r)), r;
});
s.handle("dialog:showMessageBox", async (o, t) => F.showMessageBox(v, t));
s.handle("file:read", async (o, t) => {
  const e = b(t, ...P());
  return _.promises.readFile(e);
});
s.handle("file:write", async (o, t, e) => {
  const a = b(t, ...P());
  await _.promises.writeFile(a, e, "utf-8");
});
s.handle("file:getInfo", async (o, t) => {
  const e = b(t, ...P());
  return {
    size: (await _.promises.stat(e)).size,
    path: e,
    name: u.basename(e),
    ext: u.extname(e).toLowerCase()
  };
});
s.handle("file:getTempPath", () => m.getPath("temp"));
const X = /* @__PURE__ */ new Set([
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
  const e = u.resolve(t), a = u.extname(e).toLowerCase();
  if (!X.has(a))
    throw new Error("Only media files can be registered");
  A.add(e);
});
s.handle("ffmpeg:extractAudio", async (o, t, e, a = "flac") => {
  const n = b(t, ...P()), r = b(e, ...P()), p = a === "mp3" ? "libmp3lame" : "flac";
  return new Promise((c, i) => {
    T(n).audioCodec(p).toFormat(a).on("end", () => c(r)).on("error", (l) => i(l.message)).save(r);
  });
});
s.handle("ffmpeg:getDuration", async (o, t) => {
  const e = b(t, ...P());
  return new Promise((a, n) => {
    T.ffprobe(e, (r, p) => {
      r ? n(r.message) : a(p.format.duration || 0);
    });
  });
});
s.handle("ffmpeg:detectSilences", async (o, t, e, a) => {
  const n = b(t, ...P());
  if (!Number.isFinite(e) || e < -100 || e > 0)
    throw new Error("Invalid threshold: must be between -100 and 0");
  if (!Number.isFinite(a) || a < 0.1 || a > 60)
    throw new Error("Invalid minDuration: must be between 0.1 and 60");
  return new Promise((r, p) => {
    const c = [];
    let i = null;
    T(n).audioFilters(`silencedetect=noise=${e}dB:d=${a}`).format("null").on("stderr", (l) => {
      const f = l.match(/silence_start:\s*([\d.]+)/);
      f && (i = { start: parseFloat(f[1]) });
      const d = l.match(/silence_end:\s*([\d.]+)/);
      d && i && (i.end = parseFloat(d[1]), c.push(i), i = null);
    }).on("end", () => r(c)).on("error", (l) => p(l.message)).output(process.platform === "win32" ? "NUL" : "/dev/null").run();
  });
});
s.handle("ffmpeg:splitAudio", async (o, t, e, a = "flac") => {
  const n = b(t, ...P()), r = [], p = a === "mp3" ? "libmp3lame" : "flac";
  for (const c of e) {
    const i = b(c.outputPath, ...P());
    await new Promise((l, f) => {
      T(n).setStartTime(c.start).setDuration(c.end - c.start).audioCodec(p).toFormat(a).on("end", () => {
        r.push(i), l();
      }).on("error", (d) => f(d.message)).save(i);
    });
  }
  return r;
});
s.handle("app:getVersion", () => m.getVersion());
s.handle("app:checkForUpdates", async () => {
  if (!m.isPackaged) return { updateAvailable: !1 };
  try {
    return { updateAvailable: !!(await y.checkForUpdates())?.updateInfo };
  } catch {
    return { updateAvailable: !1 };
  }
});
s.handle("app:downloadUpdate", async () => {
  m.isPackaged && await y.downloadUpdate();
});
s.handle("app:installUpdate", () => {
  y.quitAndInstall(!1, !0);
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
s.handle("ai:callProvider", async (o, t, e, a, n, r, p = "flac", c, i) => {
  const l = `audio/${p}`;
  switch (t) {
    case "gemini": {
      const { GoogleGenerativeAI: f } = await import("./index-C45_meK_.js"), g = await (await new f(e).getGenerativeModel({ model: a }).generateContent([
        n,
        {
          inlineData: {
            mimeType: l,
            data: r
          }
        }
      ])).response, w = g.usageMetadata;
      return {
        text: g.text(),
        tokenUsage: {
          inputTokens: w?.promptTokenCount ?? 0,
          outputTokens: w?.candidatesTokenCount ?? 0,
          provider: "gemini",
          model: a,
          timestamp: Date.now()
        }
      };
    }
    case "openai":
      if (a.startsWith("gpt-4o")) {
        let d = a;
        a === "gpt-4o" ? d = "gpt-4o-audio-preview" : a === "gpt-4o-mini" && (d = "gpt-4o-mini-audio-preview");
        const h = [
          {
            role: "user",
            content: [
              { type: "text", text: n },
              {
                type: "input_audio",
                input_audio: {
                  data: r,
                  format: p === "mp3" ? "mp3" : "wav"
                  // OpenAI supports wav, mp3. 
                }
              }
            ]
          }
        ], g = await x.fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${e}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: d,
            modalities: ["text"],
            // We only want text back
            messages: h
          })
        });
        if (!g.ok) {
          const M = await g.json().catch(() => ({ error: { message: g.statusText } }));
          throw new Error(`OpenAI API error: ${M.error?.message || g.statusText}`);
        }
        const w = await g.json();
        return {
          text: w.choices[0]?.message?.content || "",
          tokenUsage: {
            inputTokens: w.usage?.prompt_tokens || 0,
            outputTokens: w.usage?.completion_tokens || 0,
            provider: "openai",
            model: a,
            timestamp: Date.now()
          }
        };
      } else {
        const d = Buffer.from(r, "base64"), k = new Blob([d], { type: l }), h = new FormData();
        h.append("file", k, `audio.${p}`), h.append("model", "whisper-1"), h.append("response_format", "verbose_json"), h.append("timestamp_granularities[]", "word"), c && h.append("language", c);
        let g = z;
        i && (g = `${i}

${g}`), h.append("prompt", g);
        const w = await x.fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${e}`
          },
          body: h
        });
        if (!w.ok) {
          const M = await w.json().catch(() => ({ error: { message: w.statusText } }));
          throw new Error(`OpenAI API error: ${M.error?.message || w.statusText}`);
        }
        const S = await w.json();
        return {
          text: JSON.stringify(S),
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
      const { GoogleGenerativeAI: r } = await import("./index-C45_meK_.js"), l = await (await new r(e).getGenerativeModel({ model: a }).generateContent(n)).response, f = l.usageMetadata;
      return {
        text: l.text(),
        tokenUsage: {
          inputTokens: f?.promptTokenCount ?? 0,
          outputTokens: f?.candidatesTokenCount ?? 0,
          provider: "gemini",
          model: a,
          timestamp: Date.now()
        }
      };
    }
    case "openai": {
      let r = a;
      a === "gpt-4o-audio-preview" && (r = "gpt-4o"), a === "gpt-4o-mini-audio-preview" && (r = "gpt-4o-mini"), a === "whisper-1" && (r = "gpt-4o-mini");
      const p = [
        {
          role: "user",
          content: n
        }
      ], c = await x.fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${e}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: r,
          messages: p
        })
      });
      if (!c.ok) {
        const f = await c.json().catch(() => ({ error: { message: c.statusText } }));
        throw new Error(`OpenAI API error: ${f.error?.message || c.statusText}`);
      }
      const i = await c.json();
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
