# Subtitles Generator

A desktop app that generates high-quality subtitles from audio/video files using Gemini AI.

## Features

- Transcribe audio and video files into SRT subtitles
- Powered by Google Gemini AI (Flash or Pro)
- Automatic silence detection and smart audio chunking
- Gap healing — re-transcribes missed speech segments
- Subtitle quality enforcement (minimum display duration, reading speed)
- Multi-language support with auto-detection
- Built-in subtitle editor and timeline preview
- Video preview with subtitle overlay

## Requirements

- A [Google Gemini API key](https://aistudio.google.com/apikey)
- Node.js 18+

## Development

```bash
npm install
npm run dev
```

## Building Installers

Build for the current platform:

```bash
npm run build:electron
```

Build for a specific platform:

```bash
# macOS
npm run build && npx electron-builder --mac

# Windows (requires win32 ffmpeg/ffprobe binaries in node_modules)
npm run build && npx electron-builder --win --x64

# Linux
npm run build && npx electron-builder --linux --x64
```

Installers are output to the `release/` directory.

### Windows cross-compilation from macOS

The Windows ffmpeg/ffprobe binaries aren't installed by npm on macOS (they're platform-specific optional dependencies). To cross-compile, manually fetch them first:

```bash
npm pack @ffmpeg-installer/win32-x64
npm pack @ffprobe-installer/win32-x64
mkdir -p node_modules/@ffmpeg-installer/win32-x64 node_modules/@ffprobe-installer/win32-x64
tar xzf ffmpeg-installer-win32-x64-*.tgz -C node_modules/@ffmpeg-installer/win32-x64 --strip-components=1
tar xzf ffprobe-installer-win32-x64-*.tgz -C node_modules/@ffprobe-installer/win32-x64 --strip-components=1
rm *.tgz
npm run build && npx electron-builder --win --x64
```

## Tech Stack

- Electron
- React + TypeScript
- Vite
- Google Gemini API
- FFmpeg (bundled)
