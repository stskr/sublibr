import { protocol as U, app as v, ipcMain as i, BrowserWindow as j, dialog as O, net as S, shell as D, safeStorage as E } from "electron";
import N from "http";
import m from "path";
import P from "fs";
import { fileURLToPath as W } from "url";
import V from "electron-store";
import T from "fluent-ffmpeg";
import { createRequire as z } from "module";
import B from "electron-updater";
const K = "Transcribe accurately. Use proper punctuation. For example: Hello, world! How are you doing today?", { autoUpdater: _ } = B, R = m.dirname(W(import.meta.url));
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
  const e = m.resolve(o);
  if (A.has(e)) return e;
  for (const n of t) {
    const a = m.resolve(n);
    if (e === a || e.startsWith(a + m.sep))
      return e;
  }
  throw new Error("Access denied: path is outside allowed directories");
}
function y() {
  return [
    v.getPath("temp"),
    v.getPath("userData")
  ];
}
const M = ["settings", "recent-files", "subtitle-cache", "subtitle-versions"];
if (v.isPackaged) {
  const o = process.platform === "win32" ? ".exe" : "";
  T.setFfmpegPath(m.join(process.resourcesPath, "ffmpeg", "ffmpeg" + o)), T.setFfprobePath(m.join(process.resourcesPath, "ffprobe", "ffprobe" + o));
} else {
  const o = z(import.meta.url);
  T.setFfmpegPath(o("@ffmpeg-installer/ffmpeg").path), T.setFfprobePath(o("@ffprobe-installer/ffprobe").path);
}
const C = new V();
let w = null;
function H() {
  w = new j({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: m.join(R, "preload.js"),
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !0
    },
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0a0a0f"
  }), w.webContents.setWindowOpenHandler(({ url: o }) => ((o.startsWith("http://") || o.startsWith("https://")) && D.openExternal(o), { action: "deny" })), w.webContents.on("will-navigate", (o, t) => {
    const e = process.env.VITE_DEV_SERVER_URL || "file://";
    t.startsWith(e) || (o.preventDefault(), D.openExternal(t));
  }), process.env.VITE_DEV_SERVER_URL ? (w.loadURL(process.env.VITE_DEV_SERVER_URL), w.webContents.openDevTools()) : w.loadFile(m.join(R, "../dist/index.html"));
}
function G(o) {
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
let I = 0;
function q() {
  const o = N.createServer(async (t, e) => {
    try {
      if (e.setHeader("Access-Control-Allow-Origin", "*"), e.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS"), e.setHeader("Access-Control-Allow-Headers", "Range"), t.method === "OPTIONS") {
        e.writeHead(200), e.end();
        return;
      }
      const n = new URL(t.url || "", `http://localhost:${I}`);
      if (n.pathname !== "/stream") {
        e.writeHead(404), e.end("Not Found");
        return;
      }
      const a = n.searchParams.get("file");
      if (!a) {
        e.writeHead(400), e.end("Missing file parameter");
        return;
      }
      const s = decodeURIComponent(a), p = b(s, ...y()), r = (await P.promises.stat(p)).size, u = t.headers.range, d = G(m.extname(p));
      if (u) {
        const l = u.replace(/bytes=/, "").split("-"), k = parseInt(l[0], 10), h = l[1] ? parseInt(l[1], 10) : r - 1, g = h - k + 1, f = P.createReadStream(p, { start: k, end: h }), x = {
          "Content-Range": `bytes ${k}-${h}/${r}`,
          "Accept-Ranges": "bytes",
          "Content-Length": g,
          "Content-Type": d
        };
        e.writeHead(206, x), f.pipe(e);
      } else {
        const l = {
          "Content-Length": r,
          "Content-Type": d
        };
        e.writeHead(200, l), P.createReadStream(p).pipe(e);
      }
    } catch (n) {
      console.error("Media server error:", n), e.headersSent || (e.writeHead(500), e.end("Internal Server Error"));
    }
  });
  o.listen(0, "127.0.0.1", () => {
    const t = o.address();
    t && typeof t != "string" && (I = t.port, console.log(`Media server listening on port ${I}`));
  });
}
v.whenReady().then(() => {
  q(), U.handle("media", (o) => {
    const t = o.url.replace("media://", "");
    try {
      const e = `http://localhost:${I}/stream?file=${t}`;
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
v.on("window-all-closed", () => {
  process.platform !== "darwin" && v.quit();
});
function L() {
  try {
    const o = v.getPath("temp"), t = P.readdirSync(o);
    for (const e of t)
      if (/^(chunk_\d+\.(flac|mp3)|gap_heal_\d+.*\.flac|subtitles_gen_audio_\d+\.(flac|mp3))$/.test(e))
        try {
          P.unlinkSync(m.join(o, e));
        } catch {
        }
  } catch {
  }
}
v.on("before-quit", L);
i.handle("file:cleanupTempAudio", () => L());
v.on("activate", () => {
  j.getAllWindows().length === 0 && H();
});
v.isPackaged && (_.autoDownload = !1, _.autoInstallOnAppQuit = !0, v.whenReady().then(() => {
  setTimeout(() => {
    _.checkForUpdates().catch(() => {
    });
  }, 5e3);
}), _.on("update-available", (o) => {
  w?.webContents.send("update-available", {
    version: o.version,
    releaseNotes: o.releaseNotes,
    releaseDate: o.releaseDate
  });
}), _.on("download-progress", (o) => {
  w?.webContents.send("update-download-progress", {
    percent: Math.round(o.percent),
    transferred: o.transferred,
    total: o.total
  });
}), _.on("update-downloaded", (o) => {
  w?.webContents.send("update-downloaded", {
    version: o.version
  });
}), _.on("error", (o) => {
  w?.webContents.send("update-error", o.message);
}));
const $ = "enc:";
function J(o) {
  if (!E.isEncryptionAvailable()) return o;
  const t = o.providers;
  if (!t) return o;
  const e = { ...o, providers: { ...t } };
  for (const n of Object.keys(e.providers)) {
    const a = { ...e.providers[n] };
    typeof a.apiKey == "string" && a.apiKey && !a.apiKey.startsWith($) && (a.apiKey = $ + E.encryptString(a.apiKey).toString("base64")), e.providers[n] = a;
  }
  return e;
}
function X(o) {
  if (!E.isEncryptionAvailable()) return o;
  const t = o.providers;
  if (!t) return o;
  const e = { ...o, providers: { ...t } };
  for (const n of Object.keys(e.providers)) {
    const a = { ...e.providers[n] };
    if (typeof a.apiKey == "string" && a.apiKey.startsWith($))
      try {
        const s = Buffer.from(a.apiKey.slice($.length), "base64");
        a.apiKey = E.decryptString(s);
      } catch {
      }
    e.providers[n] = a;
  }
  return e;
}
i.handle("store:get", (o, t) => {
  if (typeof t != "string" || !M.includes(t))
    throw new Error(`Invalid store key: ${t}`);
  const e = C.get(t);
  return t === "settings" && e && typeof e == "object" ? X(e) : e;
});
i.handle("store:set", (o, t, e) => {
  if (typeof t != "string" || !M.includes(t))
    throw new Error(`Invalid store key: ${t}`);
  t === "settings" && e && typeof e == "object" ? C.set(t, J(e)) : C.set(t, e);
});
i.handle("store:delete", (o, t) => {
  if (typeof t != "string" || !M.includes(t))
    throw new Error(`Invalid store key: ${t}`);
  C.delete(t);
});
i.handle("dialog:openFile", async () => {
  const t = (await O.showOpenDialog(w, {
    properties: ["openFile"],
    filters: [
      { name: "Media Files", extensions: ["mp4", "mkv", "avi", "mov", "webm", "mp3", "wav", "aac", "m4a", "ogg", "flac"] }
    ]
  })).filePaths[0] || null;
  return t && A.add(m.resolve(t)), t;
});
i.handle("dialog:openSubtitleFile", async () => {
  const t = (await O.showOpenDialog(w, {
    properties: ["openFile"],
    filters: [
      { name: "Subtitle Files", extensions: ["srt", "vtt", "ass", "ssa"] }
    ]
  })).filePaths[0] || null;
  return t && A.add(m.resolve(t)), t;
});
i.handle("dialog:saveFile", async (o, t, e, n) => {
  const s = (await O.showSaveDialog(w, {
    defaultPath: t,
    filters: [{ name: e || "Subtitle File", extensions: n || [t.split(".").pop() || "srt"] }]
  })).filePath || null;
  return s && A.add(m.resolve(s)), s;
});
i.handle("dialog:showMessageBox", async (o, t) => O.showMessageBox(w, t));
i.handle("file:read", async (o, t) => {
  const e = b(t, ...y());
  return P.promises.readFile(e);
});
i.handle("file:write", async (o, t, e) => {
  const n = b(t, ...y());
  await P.promises.writeFile(n, e, "utf-8");
});
i.handle("file:getInfo", async (o, t) => {
  const e = b(t, ...y());
  return {
    size: (await P.promises.stat(e)).size,
    path: e,
    name: m.basename(e),
    ext: m.extname(e).toLowerCase()
  };
});
i.handle("file:getTempPath", () => v.getPath("temp"));
const Q = /* @__PURE__ */ new Set([
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
i.handle("file:registerPath", (o, t) => {
  if (typeof t != "string") return;
  const e = m.resolve(t), n = m.extname(e).toLowerCase();
  if (!Q.has(n))
    throw new Error("Only media files can be registered");
  A.add(e);
});
i.handle("ffmpeg:extractAudio", async (o, t, e, n = "flac") => {
  const a = b(t, ...y()), s = b(e, ...y()), p = n === "mp3" ? "libmp3lame" : "flac";
  return new Promise((c, r) => {
    T(a).audioCodec(p).toFormat(n).on("end", () => c(s)).on("error", (u) => r(u.message)).save(s);
  });
});
i.handle("ffmpeg:getDuration", async (o, t) => {
  const e = b(t, ...y());
  return new Promise((n, a) => {
    T.ffprobe(e, (s, p) => {
      s ? a(s.message) : n(p.format.duration || 0);
    });
  });
});
i.handle("ffmpeg:getVideoInfo", async (o, t) => {
  const e = b(t, ...y());
  return new Promise((n, a) => {
    T.ffprobe(e, (s, p) => {
      if (s) a(s.message);
      else {
        const c = p.streams.find((r) => r.codec_type === "video");
        n({
          duration: p.format.duration || 0,
          width: c?.width ?? null,
          height: c?.height ?? null
        });
      }
    });
  });
});
i.handle("ffmpeg:detectSilences", async (o, t, e, n) => {
  const a = b(t, ...y());
  if (!Number.isFinite(e) || e < -100 || e > 0)
    throw new Error("Invalid threshold: must be between -100 and 0");
  if (!Number.isFinite(n) || n < 0.1 || n > 60)
    throw new Error("Invalid minDuration: must be between 0.1 and 60");
  return new Promise((s, p) => {
    const c = [];
    let r = null;
    T(a).audioFilters(`silencedetect=noise=${e}dB:d=${n}`).format("null").on("stderr", (u) => {
      const d = u.match(/silence_start:\s*([\d.]+)/);
      d && (r = { start: parseFloat(d[1]) });
      const l = u.match(/silence_end:\s*([\d.]+)/);
      l && r && (r.end = parseFloat(l[1]), c.push(r), r = null);
    }).on("end", () => s(c)).on("error", (u) => p(u.message)).output(process.platform === "win32" ? "NUL" : "/dev/null").run();
  });
});
i.handle("ffmpeg:splitAudio", async (o, t, e, n = "flac") => {
  const a = b(t, ...y()), s = [], p = n === "mp3" ? "libmp3lame" : "flac";
  for (const c of e) {
    const r = b(c.outputPath, ...y());
    await new Promise((u, d) => {
      T(a).setStartTime(c.start).setDuration(c.end - c.start).audioCodec(p).toFormat(n).on("end", () => {
        s.push(r), u();
      }).on("error", (l) => d(l.message)).save(r);
    });
  }
  return s;
});
i.handle("ffmpeg:burnSubtitles", async (o, t, e, n, a, s, p = "ass") => {
  const c = b(t, ...y()), r = b(n, ...y()), u = v.getPath("temp"), d = m.join(u, `sublibr_subs_burn.${p}`);
  await P.promises.writeFile(d, e, "utf-8");
  let l;
  process.platform === "win32" ? l = d.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "$1\\:") : l = d.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
  const k = a && s ? `scale=${a}:${s}:force_original_aspect_ratio=decrease,pad=${a}:${s}:(ow-iw)/2:(oh-ih)/2:black,subtitles='${l}'` : `subtitles='${l}'`;
  return new Promise((h, g) => {
    T(c).videoFilters(k).outputOptions(["-c:a", "copy"]).on("progress", (f) => {
      w?.webContents.send("ffmpeg:burnSubtitlesProgress", {
        percent: Math.min(99, Math.round(f.percent || 0))
      });
    }).on("end", async () => {
      await P.promises.unlink(d).catch(() => {
      }), w?.webContents.send("ffmpeg:burnSubtitlesProgress", { percent: 100 }), h(r);
    }).on("error", async (f) => {
      await P.promises.unlink(d).catch(() => {
      }), g(f.message);
    }).save(r);
  });
});
i.handle("app:getVersion", () => v.getVersion());
i.handle("app:checkForUpdates", async () => {
  if (!v.isPackaged) return { updateAvailable: !1 };
  try {
    return { updateAvailable: !!(await _.checkForUpdates())?.updateInfo };
  } catch {
    return { updateAvailable: !1 };
  }
});
i.handle("app:downloadUpdate", async () => {
  v.isPackaged && await _.downloadUpdate();
});
i.handle("app:installUpdate", () => {
  _.quitAndInstall(!1, !0);
});
i.handle("ai:testApiKey", async (o, t, e) => {
  try {
    switch (t) {
      case "gemini": {
        const n = await S.fetch(
          "https://generativelanguage.googleapis.com/v1beta/models",
          { headers: { "x-goog-api-key": e } }
        );
        return n.ok ? { ok: !0 } : { ok: !1, error: (await n.json().catch(() => ({}))).error?.message || `HTTP ${n.status}` };
      }
      case "anthropic": {
        const n = await S.fetch("https://api.anthropic.com/v1/messages", {
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
        return n.ok ? { ok: !0 } : { ok: !1, error: (await n.json().catch(() => ({}))).error?.message || `HTTP ${n.status}` };
      }
      case "openai": {
        const n = await S.fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${e}` }
        });
        return n.ok ? { ok: !0 } : { ok: !1, error: (await n.json().catch(() => ({}))).error?.message || `HTTP ${n.status}` };
      }
    }
  } catch (n) {
    return { ok: !1, error: n instanceof Error ? n.message : "Network error" };
  }
});
i.handle("ai:callProvider", async (o, t, e, n, a, s, p = "flac", c, r) => {
  const u = `audio/${p}`;
  switch (t) {
    case "gemini": {
      const { GoogleGenerativeAI: d } = await import("./index-C45_meK_.js"), g = await (await new d(e).getGenerativeModel({ model: n }).generateContent([
        a,
        {
          inlineData: {
            mimeType: u,
            data: s
          }
        }
      ])).response, f = g.usageMetadata;
      return {
        text: g.text(),
        tokenUsage: {
          inputTokens: f?.promptTokenCount ?? 0,
          outputTokens: f?.candidatesTokenCount ?? 0,
          provider: "gemini",
          model: n,
          timestamp: Date.now()
        }
      };
    }
    case "openai":
      if (n.startsWith("gpt-4o")) {
        let l = n;
        n === "gpt-4o" ? l = "gpt-4o-audio-preview" : n === "gpt-4o-mini" && (l = "gpt-4o-mini-audio-preview");
        const h = [
          {
            role: "user",
            content: [
              { type: "text", text: a },
              {
                type: "input_audio",
                input_audio: {
                  data: s,
                  format: p === "mp3" ? "mp3" : "wav"
                  // OpenAI supports wav, mp3. 
                }
              }
            ]
          }
        ], g = await S.fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${e}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: l,
            modalities: ["text"],
            // We only want text back
            messages: h
          })
        });
        if (!g.ok) {
          const F = await g.json().catch(() => ({ error: { message: g.statusText } }));
          throw new Error(`OpenAI API error: ${F.error?.message || g.statusText}`);
        }
        const f = await g.json();
        return {
          text: f.choices[0]?.message?.content || "",
          tokenUsage: {
            inputTokens: f.usage?.prompt_tokens || 0,
            outputTokens: f.usage?.completion_tokens || 0,
            provider: "openai",
            model: n,
            timestamp: Date.now()
          }
        };
      } else {
        const l = Buffer.from(s, "base64"), k = new Blob([l], { type: u }), h = new FormData();
        h.append("file", k, `audio.${p}`), h.append("model", "whisper-1"), h.append("response_format", "verbose_json"), h.append("timestamp_granularities[]", "word"), c && h.append("language", c);
        let g = K;
        r && (g = `${r}

${g}`), h.append("prompt", g);
        const f = await S.fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${e}`
          },
          body: h
        });
        if (!f.ok) {
          const F = await f.json().catch(() => ({ error: { message: f.statusText } }));
          throw new Error(`OpenAI API error: ${F.error?.message || f.statusText}`);
        }
        const x = await f.json();
        return {
          text: JSON.stringify(x),
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
i.handle("ai:callTextProvider", async (o, t, e, n, a) => {
  switch (t) {
    case "gemini": {
      const { GoogleGenerativeAI: s } = await import("./index-C45_meK_.js"), u = await (await new s(e).getGenerativeModel({ model: n }).generateContent(a)).response, d = u.usageMetadata;
      return {
        text: u.text(),
        tokenUsage: {
          inputTokens: d?.promptTokenCount ?? 0,
          outputTokens: d?.candidatesTokenCount ?? 0,
          provider: "gemini",
          model: n,
          timestamp: Date.now()
        }
      };
    }
    case "openai": {
      let s = n;
      n === "gpt-4o-audio-preview" && (s = "gpt-4o"), n === "gpt-4o-mini-audio-preview" && (s = "gpt-4o-mini"), n === "whisper-1" && (s = "gpt-4o-mini");
      const p = [
        {
          role: "user",
          content: a
        }
      ], c = await S.fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${e}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: s,
          messages: p
        })
      });
      if (!c.ok) {
        const d = await c.json().catch(() => ({ error: { message: c.statusText } }));
        throw new Error(`OpenAI API error: ${d.error?.message || c.statusText}`);
      }
      const r = await c.json();
      return {
        text: r.choices[0]?.message?.content || "",
        tokenUsage: {
          inputTokens: r.usage?.prompt_tokens || 0,
          outputTokens: r.usage?.completion_tokens || 0,
          provider: "openai",
          model: n,
          timestamp: Date.now()
        }
      };
    }
  }
});
