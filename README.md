# SUBLIBR

![License](https://img.shields.io/badge/license-MIT-blue.svg)

A modern, AI-powered desktop application that generates high-quality subtitles for your videos and audio files. Supports multiple AI providers: Google Gemini and OpenAI.

## ✨ Features

- **🎙️ AI Transcription**: Multi-provider support — Google Gemini and OpenAI — with per-provider API key validation.
- **🌍 90+ Languages**: Auto-detects languages or lets you choose from over 90 options.
- **🔄 Versions & Regenerate**: Create multiple subtitle versions with different settings and switch between them instantly.
- **🌐 Translate**: Easily translate generated subtitles to another language using a text-to-text AI model while perfectly preserving timestamps.
- **⚡ Efficient Streaming**: Handles large video files smoothly using a local HTTP server for instant seeking.
- **✂️ Smart Processing**: Automatically handles long files by splitting them into chunks with context-aware overlap.
- **🩹 Gap Healing**: intelligently detects and fills in missing subtitles that AI might have skipped.
- **📤 Multi-Format Export**: Support for SRT, WebVTT, and ASS formats.
- **📝 Recent Files History**: Keep track of your last 10 generated or opened files for quick access, with automatic subtitle caching for instant restoration.
- **⚡ Quality Control**: Enforces reading speeds, line limits, and minimum durations for professional-looking subtitles.
- **🛠️ Customizable**: Screen size formatting (Wide, Square, Vertical), extensive language support, and editor features.
- **⌨️ Keyboard Shortcuts**: Control playback (Space, Arrows) and editing (Undo/Redo, Insert/Delete) with global shortcuts.
- **🎬 Advanced Visual Editor**: Two-tier timeline with zoomed detail view, **precision ruler**, **vertical grid**, and global minimap for precise navigation using a dual-handle slider. Includes **Scissors tool** (shortcut C) for splitting and **drag-to-trim** functionality.
- **🔍 Search & Replace**: Find and correct text across all subtitles with highlighting and "Replace All" functionality.
- **👁️ Preview Mode**: Toggle between subtitle list and inline preview — video with subtitle overlay for video files, cinema screen for audio files. Supports **direct inline editing** when paused.
- **♿ Accessible**: Full ARIA support with keyboard navigation, focus traps on modals, screen reader announcements, and labeled controls.
- **🔒 Private & Local**: Your files stay on your machine (except for the audio chunks sent securely to the selected AI provider).

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v18 or newer
- **AI Provider API Key** (at least one):
  - [Google AI Studio](https://aistudio.google.com/apikey) (Gemini)
  - [OpenAI Platform](https://platform.openai.com/api-keys) (GPT, Whisper)

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/yourusername/subtitles-gen.git
    cd subtitles-gen
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Run the app**
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

1.  **Set API Key**: Click the **Settings** (gear icon) in the top right, toggle the providers you want, paste an API key for each, and click **Test** to verify. Select your active model from the hero dropdown.
2.  **Import Media**: Drag & drop a file, or click to browse. Robustly supports audio (mp3, wav, flac, etc.) and video (mp4, mkv, mov, etc.).
3.  **Generate**: Select your language (or leave as Auto-detect), choose your target Screen Format (Wide, Square, Vertical), and click **Generate Subtitles**.
4.  **Edit & Export**: Review the generated subtitles in the timeline editor, make any fixes, and click **Download SRT** to save.

## ⚙️ Configuration

- **Model Selection**: Choose from models across all enabled providers in the "Active Model" dropdown (e.g. Gemini 2.5 Flash, GPT-4o, Whisper-1).
- **Theme**: The app defaults to a modern dark theme optimized for video editing.

## 🏗️ Tech Stack

- **Core**: Electron, React 19, TypeScript, Vite
- **AI**: Google Gemini, OpenAI (multi-provider)
- **Media**: FFmpeg (via `@ffmpeg-installer` for easy distribution)
- **Styling**: Vanilla CSS with comprehensive design tokens

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.
