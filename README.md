# Subtitles Generator

![License](https://img.shields.io/badge/license-MIT-blue.svg)

A modern, AI-powered desktop application that generates high-quality subtitles for your videos and audio files using Google's Gemini AI.

## ✨ Features

- **🎙️ AI Transcription**: Powered by Google Gemini (Flash & Pro models) for industry-leading accuracy.
- **🌍 90+ Languages**: Auto-detects languages or lets you choose from over 90 options.
- **✂️ Smart Processing**: Automatically handles long files by splitting them into chunks with context-aware overlap.
- **🩹 Gap Healing**: intelligently detects and fills in missing subtitles that AI might have skipped.
- **⚡ Quality Control**: Enforces reading speeds, line limits, and minimum durations for professional-looking subtitles.
- **🎬 Visual Editor**: Built-in timeline editor with real-time video preview.
- **🔒 Private & Local**: Your files stay on your machine (except for the audio chunks sent securely to Gemini API).

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v18 or newer
- **Google Gemini API Key**: You can get a free key from [Google AI Studio](https://aistudio.google.com/apikey).

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

1.  **Set API Key**: Click the **Settings** (gear icon) in the top right and paste your Google Gemini API Key.
2.  **Load Media**: Drop a video or audio file into the main window.
3.  **Generate**: Select your language (or leave as Auto-detect) and click **Generate Subtitles**.
4.  **Edit & Export**: Review the generated subtitles in the timeline editor, make any fixes, and click **Download SRT** to save.

## ⚙️ Configuration

- **Model Selection**: Switch between `Gemini 2.5 Flash` (faster, cheaper) and `Gemini 2.5 Pro` (higher accuracy) in Settings.
- **Theme**: The app defaults to a modern dark theme optimized for video editing.

## 🏗️ Tech Stack

- **Core**: Electron, React 19, TypeScript, Vite
- **AI**: Google Generative AI SDK
- **Media**: FFmpeg (via `@ffmpeg-installer` for easy distribution)
- **Styling**: Vanilla CSS with comprehensive design tokens

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.
