import { protocol as U, app as m, BrowserWindow as j, ipcMain as s, dialog as O, net as x, shell as D, safeStorage as E } from "electron";
import L from "http";
import u from "path";
import k from "fs";
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
    const r = u.resolve(a);
    if (e === r || e.startsWith(r + u.sep))
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
const I = new W();
let w = null;
function H() {
  w = new j({
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
  }), w.webContents.setWindowOpenHandler(({ url: o }) => ((o.startsWith("http://") || o.startsWith("https://")) && D.openExternal(o), { action: "deny" })), w.webContents.on("will-navigate", (o, t) => {
    const e = process.env.VITE_DEV_SERVER_URL || "file://";
    t.startsWith(e) || (o.preventDefault(), D.openExternal(t));
  }), process.env.VITE_DEV_SERVER_URL ? (w.loadURL(process.env.VITE_DEV_SERVER_URL), w.webContents.openDevTools()) : w.loadFile(u.join(R, "../dist/index.html"));
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
let S = 0;
function G() {
  const o = L.createServer(async (t, e) => {
    try {
      if (e.setHeader("Access-Control-Allow-Origin", "*"), e.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS"), e.setHeader("Access-Control-Allow-Headers", "Range"), t.method === "OPTIONS") {
        e.writeHead(200), e.end();
        return;
      }
      const a = new URL(t.url || "", `http://localhost:${S}`);
      if (a.pathname !== "/stream") {
        e.writeHead(404), e.end("Not Found");
        return;
      }
      const r = a.searchParams.get("file");
      if (!r) {
        e.writeHead(400), e.end("Missing file parameter");
        return;
      }
      const n = decodeURIComponent(r), p = b(n, ...P()), i = (await k.promises.stat(p)).size, l = t.headers.range, f = K(u.extname(p));
      if (l) {
        const d = l.replace(/bytes=/, "").split("-"), _ = parseInt(d[0], 10), v = d[1] ? parseInt(d[1], 10) : i - 1, h = v - _ + 1, g = k.createReadStream(p, { start: _, end: v }), F = {
          "Content-Range": `bytes ${_}-${v}/${i}`,
          "Accept-Ranges": "bytes",
          "Content-Length": h,
          "Content-Type": f
        };
        e.writeHead(206, F), g.pipe(e);
      } else {
        const d = {
          "Content-Length": i,
          "Content-Type": f
        };
        e.writeHead(200, d), k.createReadStream(p).pipe(e);
      }
    } catch (a) {
      console.error("Media server error:", a), e.headersSent || (e.writeHead(500), e.end("Internal Server Error"));
    }
  });
  o.listen(0, "127.0.0.1", () => {
    const t = o.address();
    t && typeof t != "string" && (S = t.port, console.log(`Media server listening on port ${S}`));
  });
}
m.whenReady().then(() => {
  G(), U.handle("media", (o) => {
    const t = o.url.replace("media://", "");
    try {
      const e = `http://localhost:${S}/stream?file=${t}`;
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
    const o = m.getPath("temp"), t = k.readdirSync(o);
    for (const e of t)
      /^(chunk_\d+\.flac|gap_heal_\d+.*\.flac|subtitles_gen_audio_\d+\.flac)$/.test(e) && k.unlinkSync(u.join(o, e));
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
  w?.webContents.send("update-available", {
    version: o.version,
    releaseNotes: o.releaseNotes,
    releaseDate: o.releaseDate
  });
}), y.on("download-progress", (o) => {
  w?.webContents.send("update-download-progress", {
    percent: Math.round(o.percent),
    transferred: o.transferred,
    total: o.total
  });
}), y.on("update-downloaded", (o) => {
  w?.webContents.send("update-downloaded", {
    version: o.version
  });
}), y.on("error", (o) => {
  w?.webContents.send("update-error", o.message);
}));
const C = "enc:";
function q(o) {
  if (!E.isEncryptionAvailable()) return o;
  const t = o.providers;
  if (!t) return o;
  const e = { ...o, providers: { ...t } };
  for (const a of Object.keys(e.providers)) {
    const r = { ...e.providers[a] };
    typeof r.apiKey == "string" && r.apiKey && !r.apiKey.startsWith(C) && (r.apiKey = C + E.encryptString(r.apiKey).toString("base64")), e.providers[a] = r;
  }
  return e;
}
function J(o) {
  if (!E.isEncryptionAvailable()) return o;
  const t = o.providers;
  if (!t) return o;
  const e = { ...o, providers: { ...t } };
  for (const a of Object.keys(e.providers)) {
    const r = { ...e.providers[a] };
    if (typeof r.apiKey == "string" && r.apiKey.startsWith(C))
      try {
        const n = Buffer.from(r.apiKey.slice(C.length), "base64");
        r.apiKey = E.decryptString(n);
      } catch {
      }
    e.providers[a] = r;
  }
  return e;
}
s.handle("store:get", (o, t) => {
  if (typeof t != "string" || !$.includes(t))
    throw new Error(`Invalid store key: ${t}`);
  const e = I.get(t);
  return t === "settings" && e && typeof e == "object" ? J(e) : e;
});
s.handle("store:set", (o, t, e) => {
  if (typeof t != "string" || !$.includes(t))
    throw new Error(`Invalid store key: ${t}`);
  t === "settings" && e && typeof e == "object" ? I.set(t, q(e)) : I.set(t, e);
});
s.handle("store:delete", (o, t) => {
  if (typeof t != "string" || !$.includes(t))
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
  return t && A.add(u.resolve(t)), t;
});
s.handle("dialog:openSubtitleFile", async () => {
  const t = (await O.showOpenDialog(w, {
    properties: ["openFile"],
    filters: [
      { name: "Subtitle Files", extensions: ["srt", "vtt", "ass", "ssa"] }
    ]
  })).filePaths[0] || null;
  return t && A.add(u.resolve(t)), t;
});
s.handle("dialog:saveFile", async (o, t, e, a) => {
  const n = (await O.showSaveDialog(w, {
    defaultPath: t,
    filters: [{ name: e || "Subtitle File", extensions: a || [t.split(".").pop() || "srt"] }]
  })).filePath || null;
  return n && A.add(u.resolve(n)), n;
});
s.handle("dialog:showMessageBox", async (o, t) => O.showMessageBox(w, t));
s.handle("file:read", async (o, t) => {
  const e = b(t, ...P());
  return k.promises.readFile(e);
});
s.handle("file:write", async (o, t, e) => {
  const a = b(t, ...P());
  await k.promises.writeFile(a, e, "utf-8");
});
s.handle("file:getInfo", async (o, t) => {
  const e = b(t, ...P());
  return {
    size: (await k.promises.stat(e)).size,
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
  const r = b(t, ...P()), n = b(e, ...P()), p = a === "mp3" ? "libmp3lame" : "flac";
  return new Promise((c, i) => {
    T(r).audioCodec(p).toFormat(a).on("end", () => c(n)).on("error", (l) => i(l.message)).save(n);
  });
});
s.handle("ffmpeg:getDuration", async (o, t) => {
  const e = b(t, ...P());
  return new Promise((a, r) => {
    T.ffprobe(e, (n, p) => {
      n ? r(n.message) : a(p.format.duration || 0);
    });
  });
});
s.handle("ffmpeg:detectSilences", async (o, t, e, a) => {
  const r = b(t, ...P());
  if (!Number.isFinite(e) || e < -100 || e > 0)
    throw new Error("Invalid threshold: must be between -100 and 0");
  if (!Number.isFinite(a) || a < 0.1 || a > 60)
    throw new Error("Invalid minDuration: must be between 0.1 and 60");
  return new Promise((n, p) => {
    const c = [];
    let i = null;
    T(r).audioFilters(`silencedetect=noise=${e}dB:d=${a}`).format("null").on("stderr", (l) => {
      const f = l.match(/silence_start:\s*([\d.]+)/);
      f && (i = { start: parseFloat(f[1]) });
      const d = l.match(/silence_end:\s*([\d.]+)/);
      d && i && (i.end = parseFloat(d[1]), c.push(i), i = null);
    }).on("end", () => n(c)).on("error", (l) => p(l.message)).output(process.platform === "win32" ? "NUL" : "/dev/null").run();
  });
});
s.handle("ffmpeg:splitAudio", async (o, t, e, a = "flac") => {
  const r = b(t, ...P()), n = [], p = a === "mp3" ? "libmp3lame" : "flac";
  for (const c of e) {
    const i = b(c.outputPath, ...P());
    await new Promise((l, f) => {
      T(r).setStartTime(c.start).setDuration(c.end - c.start).audioCodec(p).toFormat(a).on("end", () => {
        n.push(i), l();
      }).on("error", (d) => f(d.message)).save(i);
    });
  }
  return n;
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
s.handle("ai:callProvider", async (o, t, e, a, r, n, p = "flac", c, i) => {
  const l = `audio/${p}`;
  switch (t) {
    case "gemini": {
      const { GoogleGenerativeAI: f } = await import("./index-C45_meK_.js"), h = await (await new f(e).getGenerativeModel({ model: a }).generateContent([
        r,
        {
          inlineData: {
            mimeType: l,
            data: n
          }
        }
      ])).response, g = h.usageMetadata;
      return {
        text: h.text(),
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
        let d = a;
        a === "gpt-4o" ? d = "gpt-4o-audio-preview" : a === "gpt-4o-mini" && (d = "gpt-4o-mini-audio-preview");
        const v = [
          {
            role: "user",
            content: [
              { type: "text", text: r },
              {
                type: "input_audio",
                input_audio: {
                  data: n,
                  format: p === "mp3" ? "mp3" : "wav"
                  // OpenAI supports wav, mp3. 
                }
              }
            ]
          }
        ], h = await x.fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${e}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: d,
            modalities: ["text"],
            // We only want text back
            messages: v
          })
        });
        if (!h.ok) {
          const M = await h.json().catch(() => ({ error: { message: h.statusText } }));
          throw new Error(`OpenAI API error: ${M.error?.message || h.statusText}`);
        }
        const g = await h.json();
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
        const d = Buffer.from(n, "base64"), _ = new Blob([d], { type: l }), v = new FormData();
        v.append("file", _, `audio.${p}`), v.append("model", "whisper-1"), v.append("response_format", "srt"), c && v.append("language", c);
        let h = z;
        i && (h = `${i}

${h}`), v.append("prompt", h);
        const g = await x.fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${e}`
          },
          body: v
        });
        if (!g.ok) {
          const M = await g.json().catch(() => ({ error: { message: g.statusText } }));
          throw new Error(`OpenAI API error: ${M.error?.message || g.statusText}`);
        }
        return {
          text: await g.text(),
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
s.handle("ai:callTextProvider", async (o, t, e, a, r) => {
  switch (t) {
    case "gemini": {
      const { GoogleGenerativeAI: n } = await import("./index-C45_meK_.js"), l = await (await new n(e).getGenerativeModel({ model: a }).generateContent(r)).response, f = l.usageMetadata;
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
      let n = a;
      a === "gpt-4o-audio-preview" && (n = "gpt-4o"), a === "gpt-4o-mini-audio-preview" && (n = "gpt-4o-mini"), a === "whisper-1" && (n = "gpt-4o-mini");
      const p = [
        {
          role: "user",
          content: r
        }
      ], c = await x.fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${e}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: n,
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
