# SUBLIBR

<img src="src/assets/Logo/logo-black.svg" alt="Sublibr" height="40">

![License](https://img.shields.io/badge/license-MIT-blue.svg)

A desktop app that turns video and audio into **timed subtitles**. Transcribe on this computer or in the cloud, edit on a timeline, style the text, and export files or a burned-in video.

תוכנה שולחנית לתמלול וידאו ואודיו לכתוביות עם חותמות זמן. אפשר לעבוד לגמרי במחשב (Whisper, כולל משקלי ivrit.ai לעברית) או בענן (Gemini / OpenAI).

## Screenshots

| | |
|---|---|
| ![Home — drop media or a project](readme-screenshots/1-Upload%20Video%20Audio.png) | ![API keys](readme-screenshots/2-Easy%20LLM%20Provider%20API%20Key%20Setup.png) |
| ![Generate subtitles](readme-screenshots/3-AI%20Subtitles%20Generation.png) | ![Subtitle editor](readme-screenshots/4-Subtitles%20Editor.png) |

![Preview](readme-screenshots/5-Preview%20Video.png)

## Features

**Transcription, with timestamps.** Sublibr only uses speech models that return times. Cloud: Gemini 3.5 Transcribe, or OpenAI Whisper (`whisper-1`). Offline: Whisper Large v3 Turbo on this machine; Hebrew uses dedicated [ivrit.ai](https://huggingface.co/ivrit-ai) weights.

**Translation.** Rewrite subtitle text while keeping the same cues. Cloud: Gemini or GPT. Offline: Qwen2.5 7B via `llama-server`. Whisper does not translate.

**Portable projects.** Each job is a folder (default `~/Documents/Sublibr`). Media is copied into `media/` so you can move the folder to another computer. Latest projects on the home screen: open, rename, duplicate, delete, or relink missing media. Drop or browse a video, audio file, SRT/VTT/ASS, or a Sublibr project. Start from scratch when you have no file yet.

**Editor.** Two-tier timeline (detail + minimap), scissors, drag-to-trim, search and replace, undo/redo, and inline rich text (bold, italic, underline, per-word color). RTL typography for Hebrew and similar scripts. Versions let you keep a transcription and go back to change language or model.

**Style and output.** Per-project style: font, size, color, outline, box, position. Screen format (wide 16:9, square, vertical, original) drives line length, defaults, and render size. Download SRT, WebVTT, or ASS. Burn styled subtitles into a video.

**Long files.** Splits audio into overlapping parts, stitches at boundaries, then fills gaps the model skipped. Pause and resume transcription. Token usage is shown for cloud runs.

**Private by design.** API keys live in OS-encrypted electron-store, never in the project folder. Offline audio never leaves this machine. Online runs send audio to Google or OpenAI under those providers’ terms. Session logs (no secrets) sit in each project’s `logs/` folder, last 20 kept.

## Getting started

### Prerequisites

- **Node.js** 18 or newer
- For **online** transcription: a [Google AI Studio](https://aistudio.google.com/apikey) key and/or an [OpenAI](https://platform.openai.com/api-keys) key
- For **offline** transcription and translation, see [Offline models](#offline-models)

### Run from source

```bash
git clone https://github.com/stskr/sublibr.git
cd sublibr
npm install
npm run dev
```

If Electron exits immediately in Cursor, the shell is injecting `ELECTRON_RUN_AS_NODE=1`. Clear it:

```bash
ELECTRON_RUN_AS_NODE= npm run dev
```

First launch asks where to store projects (suggested: `Documents/Sublibr`). Then Settings → **API keys** to test a cloud key, or Models → **Offline** and **Check setup**.

### Production build

```bash
# macOS
npm run build:electron

# Windows
npm run build && npx electron-builder --win

# Linux
npm run build && npx electron-builder --linux
```

### Tests

```bash
npx vitest run
```

## How to use

1. **Open something.** Drop or browse video/audio, a subtitle file, or a project folder / `project.sublibr`. Or start from scratch and add media later.
2. **Choose a model.** Settings → Models: transcribe online or offline. Cloud options appear after a key is tested. Open Models from the generate panel to jump straight there.
3. **Generate subtitles.** Pick a language (or auto-detect) and screen format, then Generate. Offline is enabled only when Whisper is actually installed and probed.
4. **Edit.** Timeline, list, or Preview. Style in Global Style. Translate or regenerate; the current version is kept.
5. **Export.** Download SRT / VTT / ASS, or Render video to burn the styled track in.

## Offline models

Put weights in a `models/` folder at the repo root (gitignored). Settings → Models → **Check setup** reports what’s missing.

| File | Used for |
|------|----------|
| `ggml-large-v3-turbo-official.bin` | Whisper Large v3 Turbo (most languages) |
| `ggml-large-v3-turbo.bin` | Hebrew (ivrit.ai) |
| `Qwen2.5-7B-Instruct-Q4_K_M.gguf` | Offline translation |

On macOS:

```bash
brew install whisper-cpp
brew install llama.cpp
```

Sublibr looks for `whisper-cli` and `llama-server` on your PATH (and Homebrew’s usual locations). The translator unloads after a few idle minutes (configurable in General). Whisper unloads after each clip.

## Project folder

```
Documents/Sublibr/
  My Video/
    project.sublibr      # JSON manifest (relative paths)
    media/               # collected copy of the source file
    subtitles.json
    versions.json
    logs/                # session-YYYYMMDD-HHMMSS.jsonl
```

Identity is the **folder**, not an absolute media path. Opening a legacy `project.json` migrates to `project.sublibr`. API keys are never written here.

## Tech stack

Electron, React 19, TypeScript, Vite, FFmpeg. Cloud: Google Gemini, OpenAI. Offline: whisper.cpp, llama.cpp. Settings in electron-store.

## License

MIT — see [LICENSE](LICENSE). FFmpeg is LGPL 2.1+; source at [ffmpeg.org/download](https://ffmpeg.org/download.html).

You are responsible for having the right to transcribe, subtitle, and distribute any media you process.
