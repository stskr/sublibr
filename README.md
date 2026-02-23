# SUBLIBR

![License](https://img.shields.io/badge/license-MIT-blue.svg)

A modern, AI-powered desktop application that generates high-quality subtitles for your videos and audio files. Supports multiple AI providers: Google Gemini and OpenAI.

## 📸 Screenshots

| | |
|---|---|
| ![Upload video or audio](readme-screenshots/1-Upload%20Video%20Audio.png) | ![API key setup](readme-screenshots/2-Easy%20LLM%20Provider%20API%20Key%20Setup.png) |
| ![AI subtitles generation](readme-screenshots/3-AI%20Subtitles%20Generation.png) | ![Subtitles editor](readme-screenshots/4-Subtitles%20Editor.png) |

![Preview video](readme-screenshots/5-Preview%20Video.png)

## ✨ Features

- **🎙️ AI Transcription**: Multi-provider support — Google Gemini and OpenAI — with per-provider API key validation and a unified "Active Model" selector.
- **🌍 90+ Languages**: Auto-detects languages or lets you choose from over 90 options.
- **🔄 Versions & Regenerate**: Create multiple subtitle versions with different settings and switch between them instantly.
- **🌐 Translate**: Translate generated subtitles to another language via a text-to-text AI model while perfectly preserving timestamps.
- **✂️ Smart Processing**: Automatically handles long files by splitting them into chunks with context-aware 20-second overlap and smart stitching at boundaries.
- **🩹 Gap Healing**: Intelligently detects and re-transcribes missing subtitle segments that AI skipped.
- **🎬 Render Video**: Burn styled subtitles directly into a video at any target resolution (Wide 16:9, Square 1:1, Vertical 9:16, or Original).
- **🎨 Global Subtitle Styling**: Full per-project style control — font, font size, text color, outline/shadow effects, background box, and precise X/Y position. Per-screen-size defaults and a one-click Reset button.
- **📤 Multi-Format Export**: SRT, WebVTT, and ASS with full style embedding.
- **📝 Recent Files History**: Tracks your last 10 files for quick access with automatic subtitle caching for instant restoration.
- **⚡ Quality Control**: Enforces reading speeds, line limits, and minimum durations for professional-looking subtitles.
- **⌨️ Keyboard Shortcuts**: Control playback (Space, Arrows) and editing (Undo/Redo, Insert/Delete, Search) with global shortcuts.
- **🎬 Advanced Visual Editor**: Two-tier timeline with a zoomed detail view, precision ruler, vertical grid, and a global minimap for precise navigation. Includes a **Scissors tool** (C) for splitting and **drag-to-trim** handles.
- **🔍 Search & Replace**: Find and correct text across all subtitles with "Replace All" and keyboard navigation.
- **✏️ Rich Text Editing**: WYSIWYG inline subtitle editing with bold, italic, underline, and per-word color markup preserved through the full pipeline.
- **👁️ Preview Mode**: Toggle between subtitle list and inline video preview. Font size scales proportionally to the selected render resolution for an accurate representation of the final render.
- **🔒 Private & Local**: Your files stay on your machine (except audio chunks sent securely to the selected AI provider).
- **♿ Accessible**: Full ARIA support with keyboard navigation, focus traps on modals, screen reader announcements, and labeled controls.

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v18 or newer
- **AI Provider API Key** (at least one):
  - [Google AI Studio](https://aistudio.google.com/apikey) (Gemini)
  - [OpenAI Platform](https://platform.openai.com/api-keys) (GPT, Whisper)

### Installation

1. **Clone the repository**
    ```bash
    git clone https://github.com/stskr/sublibr.git
    cd sublibr
    ```

2. **Install dependencies**
    ```bash
    npm install
    ```

3. **Run the app**
    ```bash
    npm run dev
    ```

### Building for Production

To create an installer for your OS (`.dmg`, `.exe`, or `.AppImage`):

```bash
# macOS
npm run build:electron

# Windows
npm run build && npx electron-builder --win

# Linux
npm run build && npx electron-builder --linux
```

## 🛠️ How to Use

1. **Set API Key**: Click **Settings** (gear icon), toggle the providers you want, paste an API key for each, and click **Test** to verify. Select your active model from the hero dropdown.
2. **Import Media**: Drag & drop a file, or click to browse. Supports audio (mp3, wav, flac, etc.) and video (mp4, mkv, mov, etc.).
3. **Generate**: Select your language (or leave as Auto-detect), choose your **Screen Format** (Wide, Square, Vertical), and click **Generate Subtitles**.
4. **Style**: Click **Global Style** to customize font, font size, colors, outline/shadow effects, background box, and subtitle position. Use **Reset** to restore per-format defaults.
5. **Edit & Preview**: Review subtitles in the timeline editor or switch to **Preview** mode to see an accurate render preview with correct font scaling per aspect ratio.
6. **Export or Render**: **Download** as SRT/VTT/ASS, or click **Render Video** to burn styled subtitles directly into your video.

## ⚙️ Configuration

- **Model Selection**: Choose from models across all enabled providers (e.g. Gemini 2.5 Flash, GPT-4o, Whisper-1).
- **Screen Format**: Wide (16:9), Square (1:1), Vertical (9:16), or Original — controls line length, font size defaults, and render resolution.
- **Subtitle Style**: Fully configurable per-project in the Global Style panel.
- **Theme**: The app defaults to a modern dark theme optimized for video editing.

## 🏗️ Tech Stack

- **Core**: Electron, React 19, TypeScript, Vite
- **AI**: Google Gemini, OpenAI (multi-provider)
- **Media**: FFmpeg (via `@ffmpeg-installer` for easy distribution)
- **Styling**: Vanilla CSS with comprehensive design tokens

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.
