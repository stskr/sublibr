# Subtitles Generator - Application Documentation

> **Last Updated**: February 16, 2026  
> **Version**: 1.0.0

---

## Table of Contents

1. [Overview](#overview)
2. [Project Structure](#project-structure)
3. [Technical Architecture](#technical-architecture)
4. [Design System](#design-system)
5. [Components](#components)
6. [Services & Processing](#services--processing)
7. [User Experience](#user-experience)
8. [Subtitle Generation Workflow](#subtitle-generation-workflow)

---

## Overview

**Subtitles Generator** is a desktop application that generates high-quality subtitles from audio and video files using Google's Gemini AI. The app runs as an Electron desktop application, providing a native experience across macOS, Windows, and Linux platforms.

### Key Features

- **AI-Powered Transcription**: Uses Google Gemini AI (Flash or Pro models) for accurate speech-to-text conversion
- **Intelligent Audio Processing**: Automatic silence detection and smart chunking (3-4 minute segments with 20s overlap)
- **Gap Healing**: Detects and re-transcribes missing subtitle segments automatically
- **Quality Enforcement**: Ensures subtitles meet display standards (max 2 lines, 8 words/line, proper duration)
- **Multi-Language Support**: 90+ languages with auto-detection capability
- **Built-in Editor**: Timeline-based subtitle editor with video preview
- **Video Overlay**: Real-time subtitle preview over video playback

### Tech Stack

| Technology | Purpose |
|------------|---------|
| **Electron** | Desktop application framework |
| **React 19** | UI framework with hooks |
| **TypeScript** | Type-safe development |
| **Vite** | Build tool and dev server |
| **Google Gemini AI** | Speech-to-text transcription |
| **FFmpeg** | Audio/video processing (extract audio, detect silences, split chunks) |
| **electron-store** | Persistent settings storage |
| **fluent-ffmpeg** | Node.js wrapper for FFmpeg |

---

## Project Structure

```
subtitles-gen/
├── electron/                    # Electron main process
│   ├── main.ts                  # Main process with IPC handlers
│   └── preload.ts              # Preload script (bridge API)
│
├── src/                        # React application source
│   ├── components/             # React components
│   │   ├── AudioPlayer.tsx
│   │   ├── FileUpload.tsx
│   │   ├── LanguageSelector.tsx
│   │   ├── ProgressIndicator.tsx
│   │   ├── Settings.tsx
│   │   ├── SubtitleEditor.tsx
│   │   └── VideoPreview.tsx
│   │
│   ├── services/               # Core business logic
│   │   ├── audioProcessor.ts   # Audio chunking & silence detection
│   │   ├── healer.ts          # Gap detection & healing
│   │   └── transcriber.ts     # AI transcription & quality enforcement
│   │
│   ├── assets/                 # Static assets
│   │   └── Fonts/
│   │       └── Signika/       # Custom Signika font
│   │
│   ├── App.tsx                # Main application component
│   ├── App.css                # Global styles & design tokens
│   ├── types.ts               # TypeScript type definitions
│   ├── utils.ts               # Utility functions
│   └── main.tsx               # React app entry point
│
├── public/                     # Static public assets
├── dist/                      # Vite build output
├── dist-electron/             # Electron build output
├── release/                   # Packaged installers
│
├── package.json               # Dependencies & build config
├── tsconfig.json              # TypeScript configuration
├── vite.config.ts             # Vite build configuration
└── README.md                  # Project README

```

### File Counts & Organization

- **React Components**: 7 files
- **Services**: 3 core modules
- **Electron Process Files**: 2 (main + preload)
- **Total Source Files**: ~15 TypeScript/TSX files
- **Lines of Code**: ~2,500 (excluding dependencies)

---

## Technical Architecture

### Architecture Pattern

The application follows a **layered architecture**:

```mermaid
graph TB
    UI[React UI Layer]
    IPC[IPC Communication Layer]
    Main[Electron Main Process]
    Services[Service Layer]
    External[External APIs & Tools]
    
    UI -->|IPC Invoke| IPC
    IPC -->|Events| Main
    Main -->|File System & FFmpeg| External
    Services -->|Gemini API| External
    UI -->|Import| Services
    
    style UI fill:#8075EB
    style Services fill:#75EBBB
    style External fill:#E0EB75
```

### 1. **Renderer Process (React UI)**

- **Framework**: React 19 with TypeScript
- **State Management**: Local component state using `useState` and `useEffect` hooks
- **UI Components**: Functional components with hooks pattern
- **Styling**: CSS-in-file with design tokens (CSS custom properties)

### 2. **IPC Communication Layer**

The app uses Electron's IPC (Inter-Process Communication) to bridge the renderer and main processes securely.

**Preload Script** (`electron/preload.ts`) exposes a safe API:

```typescript
window.electronAPI = {
  // Settings
  getStoreValue: (key: string) => ipcRenderer.invoke('store:get', key),
  setStoreValue: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),
  
  // File dialogs
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  saveFileDialog: (defaultName: string) => ipcRenderer.invoke('dialog:saveFile', defaultName),
  
  // File operations
  readFile: (path: string) => ipcRenderer.invoke('file:read', path),
  readFileAsDataUrl: (path: string) => ipcRenderer.invoke('file:readAsDataUrl', path),
  writeFile: (path: string, data: string) => ipcRenderer.invoke('file:write', path, data),
  getFileInfo: (path: string) => ipcRenderer.invoke('file:getInfo', path),
  getTempPath: () => ipcRenderer.invoke('file:getTempPath'),
  
  // FFmpeg operations
  extractAudio: (inputPath: string, outputPath: string) => 
    ipcRenderer.invoke('ffmpeg:extractAudio', inputPath, outputPath),
  getDuration: (filePath: string) => 
    ipcRenderer.invoke('ffmpeg:getDuration', filePath),
  detectSilences: (filePath: string, threshold: number, minDuration: number) => 
    ipcRenderer.invoke('ffmpeg:detectSilences', filePath, threshold, minDuration),
  splitAudio: (inputPath: string, chunks: { start: number; end: number; outputPath: string }[]) => 
    ipcRenderer.invoke('ffmpeg:splitAudio', inputPath, chunks),
  
  // Progress events
  onProgress: (callback: (progress: number) => void) => {
    ipcRenderer.on('progress', (_event, progress) => callback(progress));
  },
}
```

### 3. **Main Process (Electron)**

**File**: `electron/main.ts`

Responsibilities:
- Window management
- IPC handler registration
- File system access (with security validation)
- FFmpeg execution
- Settings persistence via `electron-store`

**Security Features**:
- Path validation against allowed directories
- Store key allowlist
- Content Security Policy (CSP)
- Sandboxed renderer process

**FFmpeg Integration**:
```typescript
// Uses bundled FFmpeg binaries shipped with the app
// Development: Uses @ffmpeg-installer packages
// Production: Copies binaries to extraResources
```

### 4. **Service Layer**

Three core services handle subtitle processing:

#### **audioProcessor.ts**
- Chunks audio into 3-4 minute segments
- Detects silence using FFmpeg filters
- Adds 20-second overlap between chunks
- Splits audio files using FFmpeg

#### **transcriber.ts**
- Sends audio chunks to Gemini AI
- Parses SRT-formatted responses
- Merges subtitles with "smart stitching" (handles chunk boundaries)
- Enforces subtitle quality standards (min/max duration, reading speed)

#### **healer.ts**
- Identifies gaps in subtitle coverage
- Filters out intentional silences
- Re-transcribes missing segments
- Merges healed subtitles back into timeline

### 5. **External Dependencies**

| API/Tool | Purpose | Configuration |
|----------|---------|---------------|
| **Google Gemini API** | Transcription | API key stored in settings |
| **FFmpeg** | Audio processing | Bundled binaries (platform-specific) |
| **ffprobe** | Media metadata | Bundled with FFmpeg |

---

## Design System

The app uses a **dark theme** with a modern, premium aesthetic built on design tokens defined in [App.css](file:///Users/staskrylov/Documents/Websites/subtitles-gen/src/App.css).

### Color Palette

```css
/* Background Colors */
--color-bg-primary: #0c0a14;      /* Darkest - main background */
--color-bg-secondary: #13111e;    /* Card backgrounds */
--color-bg-tertiary: #1b1828;     /* Input backgrounds */
--color-bg-hover: #231f33;        /* Hover states */
--color-bg-active: #2d283e;       /* Active states */

/* Accent Colors */
--color-accent: #8075EB;          /* Primary purple */
--color-accent-hover: #9990F0;    /* Lighter purple */
--color-accent-dim: rgba(128, 117, 235, 0.15);  /* Transparent purple */

/* Semantic Colors */
--color-success: #75EBBB;         /* Green - success states */
--color-warning: #E0EB75;         /* Yellow - warnings */
--color-error: #EB75A5;           /* Pink - errors */

/* Text Colors */
--color-text-primary: #f0eef8;    /* Main text */
--color-text-secondary: #9b95b8;  /* Secondary text */
--color-text-muted: #6b6488;      /* Muted text */

/* Borders */
--color-border: #2d283e;
--color-border-focus: #8075EB;
```

#### Color Usage

| Element Type | Color | Hex |
|--------------|-------|-----|
| **App Background** | Deep purple-black | `#0c0a14` |
| **Cards/Panels** | Dark purple | `#13111e` |
| **Primary Actions** | Vibrant purple | `#8075EB` |
| **Success** | Teal green | `#75EBBB` |
| **Warnings** | Soft yellow | `#E0EB75` |
| **Errors** | Rose pink | `#EB75A5` |

### Typography

#### Font Families

```css
--font-sans: 'Signika', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;
--font-subtitle: Arial, 'Helvetica Neue', Helvetica, sans-serif;
```

| Font | Usage | Source |
|------|-------|--------|
| **Signika** | Primary UI font | Local file ([Signika-VariableFont_GRAD,wght.ttf](file:///Users/staskrylov/Documents/Websites/subtitles-gen/src/assets/Fonts/Signika/Signika-VariableFont_GRAD,wght.ttf)) |
| **JetBrains Mono** | Timecodes, monospaced data | Google Fonts |
| **Material Icons Round** | Icon system | Google Fonts |
| **Arial** | Subtitle text display | System font |

#### Typography Scale

- **Body**: 14px / 1.5 line-height
- **Headers**: 16-18px, weight 600
- **Small Text**: 12-13px (labels, hints)
- **Monospaced**: 12px (timecodes)

### Spacing System

```css
--space-xs: 4px;
--space-sm: 8px;
--space-md: 16px;
--space-lg: 24px;
--space-xl: 32px;
--space-2xl: 48px;
```

### Border Radius

```css
--radius-sm: 6px;   /* Small elements */
--radius-md: 10px;  /* Buttons, inputs */
--radius-lg: 16px;  /* Cards */
--radius-full: 9999px;  /* Circular */
```

### Shadows & Elevation

```css
--shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.3);
--shadow-md: 0 4px 16px rgba(0, 0, 0, 0.4);
--shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.5);
```

### Transitions

```css
--transition-fast: 150ms ease;
--transition-normal: 250ms ease;
```

### Design Aesthetics

> [!NOTE]
> The design follows modern web app principles:
> - **Dark mode first**: Reduces eye strain, premium feel
> - **Glassmorphism**: Subtle transparency and blur effects
> - **Micro-animations**: Smooth hover states, transitions
> - **Generous spacing**: Clean, breathable layout
> - **Consistent iconography**: Material Icons Round throughout

---

## Components

### Component Architecture

All components are **functional React components** using hooks. No class components are used.

### Component Overview

| Component | File | Purpose |
|-----------|------|---------|
| `App` | [App.tsx](file:///Users/staskrylov/Documents/Websites/subtitles-gen/src/App.tsx) | Root component, orchestrates state |
| `FileUpload` | [FileUpload.tsx](file:///Users/staskrylov/Documents/Websites/subtitles-gen/src/components/FileUpload.tsx) | Drag-and-drop + file selection |
| `SubtitleEditor` | [SubtitleEditor.tsx](file:///Users/staskrylov/Documents/Websites/subtitles-gen/src/components/SubtitleEditor.tsx) | Timeline-based subtitle editor |
| `VideoPreview` | [VideoPreview.tsx](file:///Users/staskrylov/Documents/Websites/subtitles-gen/src/components/VideoPreview.tsx) | Video player with subtitle overlay |
| `AudioPlayer` | [AudioPlayer.tsx](file:///Users/staskrylov/Documents/Websites/subtitles-gen/src/components/AudioPlayer.tsx) | Audio playback control |
| `LanguageSelector` | [LanguageSelector.tsx](file:///Users/staskrylov/Documents/Websites/subtitles-gen/src/components/LanguageSelector.tsx) | Language picker with autocomplete |
| `Settings` | [Settings.tsx](file:///Users/staskrylov/Documents/Websites/subtitles-gen/src/components/Settings.tsx) | Settings modal (API key, model) |
| `ShortcutsModal` | [ShortcutsModal.tsx](file:///Users/staskrylov/Documents/Websites/subtitles-gen/src/components/ShortcutsModal.tsx) | Keyboard shortcuts reference modal |
| `ProgressIndicator` | [ProgressIndicator.tsx](file:///Users/staskrylov/Documents/Websites/subtitles-gen/src/components/ProgressIndicator.tsx) | Processing status display |

---

### Detailed Component Descriptions

#### **App (Root Component)**

**State Management**:
```typescript
const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
const [mediaFile, setMediaFile] = useState<MediaFile | null>(null);
const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
const [processingState, setProcessingState] = useState<ProcessingState>({
  status: 'idle',
  progress: 0,
});
```

**Responsibilities**:
- Load/save settings from electron-store
- Manage file selection
- Orchestrate subtitle generation pipeline
- Handle errors and processing state

**Views**:
1. File upload view (no file selected)
2. Editor view (file selected, with/without subtitles)

---

#### **FileUpload**

**Props**:
```typescript
interface FileUploadProps {
  settings: AppSettings;
  onFileSelect: (file: MediaFile) => void;
  onLanguageChange: (language: string, autoDetect: boolean) => void;
}
```

**Features**:
- Drag-and-drop zone
- File type validation (audio/video)
- File info display (name, size, duration)
- API cost estimation
- Language selection (inline)
- API key warning banner

**UX Details**:
- Animated spinner during file info loading
- Drag-over visual feedback
- Supports: `.mp4`, `.mkv`, `.avi`, `.mov`, `.webm`, `.mp3`, `.wav`, `.m4a`, `.flac`

---

#### **SubtitleEditor**

**Props**:
```typescript
interface SubtitleEditorProps {
  subtitles: Subtitle[];
  onSubtitlesChange: (subtitles: Subtitle[]) => void;
  currentTime: number;
  onSeek: (time: number) => void; // Required
}
```

**Features**:
- Scrollable subtitle list
- Inline editing (text, start/end times)
- Click to seek (if player connected)
- Auto-scroll toggle
- Delete individual entries
- Subtitle count display

**Entry Layout**:
```
[Index] [Start Time → End Time] [Text Content] [Delete]
```

**UX Details**:
- Active subtitle highlighted (based on `currentTime`)
- Monospaced timecode inputs
- Textarea auto-resize for text
- Hover states on entries

---

#### **VideoPreview**

**Props**:
```typescript
interface VideoPreviewProps {
  videoPath: string;
  subtitles: Subtitle[];
  onClose: () => void;
}
```

**Features**:
- HTML5 video player
- Subtitle overlay (centered, bottom-aligned)
- Direction detection (RTL support for Arabic/Hebrew)
- Time synchronization
- Native browser controls

**Subtitle Styling**:
- White text with black shadow/outline
- Centered horizontally
- Positioned 10% from bottom
- Max 80% width
- Font: `var(--font-subtitle)` (Arial)

---

#### **AudioPlayer**

**Props**:
```typescript
interface AudioPlayerProps {
  audioPath: string;
  currentTime: number;
  duration: number;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
}
```

**Features**:
- HTML5 audio player with custom controls
- Play/pause toggle
- Skip forward/backward (5s)
- Clickable progress bar
- Volume slider
- Time display (current / total)
- Loads audio via data URL (IPC) to avoid file protocol restrictions

**UX Details**:
- Material Icons for controls (play_arrow, pause, fast_forward, fast_rewind)
- Visual progress bar shows playback position
- Exposes `window.seekAudio()` for external time control

---

#### **LanguageSelector**

**Props**:
```typescript
interface LanguageSelectorProps {
  value: string;
  autoDetect: boolean;
  onChange: (lang: string, auto: boolean) => void;
}
```

**Features**:
- Toggle: "Auto-detect" vs "Specify language"
- Autocomplete input (90+ languages)
- Dropdown with search filtering
- Keyboard navigation
- Default: "English"

**Language List**: 92 languages including English, Spanish, French, German, Japanese, Chinese, Arabic, etc.

---

#### **Settings**

**Props**:
```typescript
interface SettingsProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  onClose: () => void;
}
```

**Fields**:
1. **API Key**: Password input
2. **Model**: Dropdown (`gemini-2.5-flash` | `gemini-2.5-pro`)
3. **Check Available Models**: Debug button to test API connection

**UX**:
- Modal overlay (backdrop)
- Close on backdrop click or "X" button
- Save button (primary action)
- Link to get API key

---

#### **ProgressIndicator**

**Props**:
```typescript
interface ProgressIndicatorProps {
  state: ProcessingState;
}
```

**Display States**:
```typescript
type ProcessingStatus = 
  | 'idle'                // "Ready"
  | 'extracting'          // "Extracting audio..."
  | 'detecting-silences'  // "Detecting silences..."
  | 'splitting'           // "Splitting audio into chunks..."
  | 'transcribing'        // "Transcribing with Gemini..." + "Chunk X of Y"
  | 'merging'             // "Merging subtitles..."
  | 'healing'             // (No UI mapping - will show default)
  | 'done'                // "Complete!"
  | 'error';              // "Error occurred" + error details
```

> [!NOTE]
> The `'healing'` status exists in TypeScript types but has no corresponding UI message in `ProgressIndicator`. If used, it will display with a default sync icon and no status message.

**UI**:
- Progress bar (0-100%)
- Status text
- Error display (if status === 'error')
- Spinner animation

---

## Services & Processing

### Core Services

#### **1. audioProcessor.ts**

**Main Function**: `createAudioChunks(audioPath, tempDir)`

**Process**:
1. Get total audio duration via `ffprobe`
2. Detect silences using FFmpeg `silencedetect` filter
   - Threshold: `-25dB` (lenient for noisy audio)
   - Min duration: `0.3s` (catch short pauses)
3. Calculate chunk boundaries:
   - **Target**: 210s (3.5 minutes)
   - **Min**: 180s (3 minutes)
   - **Max**: 240s (4 minutes)
   - **Overlap**: 20s between chunks
4. Split at silence points closest to target
5. Extract chunks using FFmpeg to FLAC format
6. Return `AudioChunk[]` + `SilenceSegment[]`

**Output**:
```typescript
{
  chunks: [
    { index: 0, startTime: 0, endTime: 210, filePath: '...chunk_000.flac', overlap: 0 },
    { index: 1, startTime: 190, endTime: 420, filePath: '...chunk_001.flac', overlap: 20 },
    ...
  ],
  silences: [
    { start: 5.2, end: 5.8 },
    { start: 42.1, end: 43.0 },
    ...
  ]
}
```

---

#### **2. transcriber.ts**

**Main Functions**:

##### `transcribeChunk(chunk, apiKey, model, language, autoDetect)`

**Process**:
1. Convert audio chunk to base64
2. Build prompt:
   ```
   Transcribe this audio to SRT format.
   Language: {language} OR Auto-detect
   
   Rules:
   - Max 2 lines per subtitle
   - Max 8 words per line
   - Min display time: 1 second
   - Accurate timestamps
   - Grammar capitalization
   ```
3. Send to Gemini AI with audio attachment
4. Parse SRT response into `Subtitle[]`
5. Adjust timestamps by `chunk.startTime` offset

**Quality Enforcement Constants**:
```typescript
const QUALITY = {
  MIN_DURATION: 1.0,           // Minimum display time
  MAX_DURATION: 7.0,           // Maximum display time
  MIN_READING_SPEED_CPS: 12,   // Characters per second (reading speed)
  MAX_CHARS_PER_LINE: 42,      // Standard subtitle line width
  MAX_LINES: 2,
  MERGE_GAP_LIMIT: 1.0,        // Max gap to merge subtitles
};
```

##### `mergeSubtitles(allSubtitles)`

**Smart Stitching Algorithm**:
1. Process chunks pairwise
2. Identify boundary subtitles (overlap zone)
3. **Duplicate detection**:
   - If text similarity > 80% and overlap > 50%, drop duplicate
4. **Partial overlap**:
   - If subtitle spans chunk boundary, keep the one from later chunk
   - Trim overlapping subtitle from earlier chunk
5. Enforce minimum gap between subtitles (0.05s)

##### `enforceSubtitleQuality(subtitles)`

**Post-processing pass**:
1. **Merge short subtitles**:
   - If duration < min reading time and gap < 1s, merge with next
2. **Extend short durations**:
   - If still too short, extend into available space
3. **Cap max duration**: Limit to 7s
4. **Remove degenerate entries**: Empty text or invalid duration

##### `generateSrt(subtitles)`

Exports subtitles to standard SRT format:
```
1
00:00:01,200 --> 00:00:03,500
Hello, welcome to the show.

2
00:00:03,800 --> 00:00:06,100
Today we're talking about subtitles.
```

---

#### **3. healer.ts**

**Main Function**: `healSubtitles(subtitles, audioPath, silences, ...)`

**Gap Healing Process**:

1. **Identify Gaps**:
   - Find time gaps between consecutive subtitles
   - Minimum gap threshold: `2.0s`

2. **Filter Out Silences**:
   - Check if gap overlaps with detected silence
   - If silence covers > 80% of gap, ignore it (intentional silence)

3. **Re-transcribe Gaps**:
   - For each actionable gap:
     - Extract audio segment (gap ± 0.5s buffer)
     - Transcribe using `transcribeChunk`
     - Collect new subtitles

4. **Merge New Subtitles**:
   - Combine original + healed subtitles
   - Sort by startTime
   - Resolve overlaps (prefer original)
   - Re-index

**Why Healing?**
- AI may miss segments during chunk boundaries
- Background noise or music might be skipped
- Ensures complete coverage of spoken content

---

## User Experience

### Application Language

**Interface Language**: English (hardcoded)

**Supported Subtitle Languages**: 92+ languages via Gemini AI

### Keyboard Shortcuts

The application supports global keyboard shortcuts for efficient workflow. A reference modal can be opened by clicking the keyboard icon in the header.

| Action | Shortcut | Context |
|--------|----------|---------|
| **Play / Pause** | `Space` | Global (unless in text input) |
| **Seek Backward 5s** | `←` (Left Arrow) | Global (unless in text input) |
| **Seek Forward 5s** | `→` (Right Arrow) | Global (unless in text input) |
| **Undo** | `Ctrl` + `Z` / `Cmd` + `Z` | Editor |
| **Redo** | `Ctrl` + `Shift` + `Z` / `Cmd` + `Shift` + `Z` | Editor |
| **Insert Subtitle** | `Alt` + `N` | Editor (at current time) |
| **Delete Subtitle** | `Alt` + `Delete` / `Backspace` | Editor (active subtitle) |
| **Save / Download** | `Ctrl` + `S` / `Cmd` + `S` | Global |

### User Workflow

```mermaid
graph TD
    Start([Launch App])
    Start --> CheckKey{API Key<br/>Configured?}
    
    CheckKey -->|No| Settings[Open Settings]
    Settings --> EnterKey[Enter API Key]
    EnterKey --> SelectFile
    
    CheckKey -->|Yes| SelectFile[Select Audio/Video File]
    
    SelectFile --> UploadView[File Upload View]
    UploadView --> ShowInfo[Display File Info & Cost]
    ShowInfo --> SelectLang[Select Language<br/>Auto-detect or Specify]
    SelectLang --> Generate[Click 'Generate']
    
    Generate --> Extract[Extract Audio to FLAC]
    Extract --> DetectSilence[Detect Silences]
    DetectSilence --> Split[Split into Chunks]
    Split --> Transcribe[Transcribe Chunks<br/>via Gemini AI]
    Transcribe --> Merge[Merge & Stitch]
    Merge --> Enforce[Enforce Quality]
    Enforce --> Heal[Heal Gaps]
    Heal --> Display[Display in Editor]
    
    Display --> Edit{Edit<br/>Subtitles?}
    Edit -->|Yes| EditView[Edit Text/Times]
    EditView --> Display
    
    Edit -->|No| Download[Download SRT]
    Download --> End([Done])
    
    style Start fill:#75EBBB
    style Settings fill:#E0EB75
    style Generate fill:#8075EB
    style Download fill:#75EBBB
    style End fill:#75EBBB
```

### Screen States

#### 1. **Initial State (No File)**

- **Header**: App title + Settings button
- **Main Area**: File upload drop zone
  - Large upload icon
  - "Drop a file or click to select"
  - Supported formats hint
  - API key warning (if not set)

#### 2. **File Selected (Before Generation)**

- **File Info Card**: Name, size, duration
- **Language Selector**: Inline dropdown
- **Cost Estimate**: Chunks, tokens, USD
- **Generate Button**: Primary action (disabled if no API key)

#### 3. **Processing State**

- **Progress Indicator**: Status + progress bar
- **Current Step**: e.g., "Transcribing chunk 3 of 12..."
- **Disabled UI**: Prevent actions during processing

#### 4. **Editor State (After Generation)**

**Layout**:
```
┌─────────────────────────────────────────────┐
│  Header: Title | Settings | Download        │
├──────────┬──────────────────────────────────┤
│          │                                   │
│ Sidebar  │      Main Editor                 │
│          │                                   │
│ - File   │  ┌─────────────────────────────┐ │
│   Info   │  │ Video Preview               │ │
│          │  │ (with subtitle overlay)     │ │
│ - Lang   │  └─────────────────────────────┘ │
│   Select │                                   │
│          │  ┌─────────────────────────────┐ │
│ - Re-gen │  │ Subtitle List               │ │
│   Button │  │ [1] 00:01→00:03  Hello...   │ │
│          │  │ [2] 00:03→00:06  Welcome... │ │
│          │  │ ...                         │ │
│          │  └─────────────────────────────┘ │
└──────────┴──────────────────────────────────┘
```

**Sidebar** (280px wide):
- File summary card
- Language selector (can change and re-generate)
- "Generate Subtitles" button

**Main Area**:
- Video/Audio preview at top
- Subtitle editor below
- Auto-scroll toggle
- Subtitle count

#### 5. **Settings Modal**

- Overlay modal (dark backdrop)
- Form fields:
  - API Key (password input)
  - Model selection (dropdown)
  - Language + auto-detect
- Save button
- Link to get API key

---

### Interaction Patterns

| Action | Trigger | Behavior |
|--------|---------|----------|
| **Upload File** | Drag-drop or click | Validates format, loads info, shows cost |
| **Generate** | Button click | Starts processing pipeline, shows progress |
| **Edit Subtitle** | Click entry | Inline editing (text + times) |
| **Seek to Subtitle** | Click entry | Jumps video/audio to that timestamp |
| **Delete Subtitle** | Delete icon | Removes entry, re-indexes |
| **Download** | Header button | Opens save dialog, exports SRT |
| **Change Language** | Sidebar dropdown | Can re-generate with new language |
| **Settings** | Header gear icon | Opens settings modal |

---

### Error Handling

| Error | Display | Recovery |
|-------|---------|----------|
| **Missing API Key** | Yellow warning banner | Directs to settings |
| **Invalid File** | Red error message | Prompt to select different file |
| **Transcription Failure** | Error state in progress | Display error message + retry option |
| **FFmpeg Error** | Error state | Show technical details for debugging |
| **Network Error** | Error state | Suggest checking connection |

---

## Subtitle Generation Workflow

### High-Level Pipeline

```
Audio/Video File
  ↓
Extract Audio (FLAC)
  ↓
Detect Silences
  ↓
Split into Chunks (3-4 min, 20s overlap)
  ↓
Transcribe Each Chunk (Gemini AI)
  ↓
Parse SRT → Subtitle Objects
  ↓
Merge & Stitch Chunks
  ↓
Enforce Quality Standards
  ↓
Heal Gaps (re-transcribe missing segments)
  ↓
Final Subtitle Set
```

---

### Detailed Steps

#### **Step 1: Extract Audio**

```typescript
// electron/main.ts - IPC handler
ipcMain.handle('ffmpeg:extractAudio', async (input, output) => {
  await ffmpeg(input)
    .toFormat('flac')
    .audioCodec('flac')
    .audioChannels(1)  // Mono
    .audioFrequency(16000)  // 16kHz
    .save(output);
});
```

**Why FLAC?**
- Lossless compression
- Smaller than WAV
- Compatible with Gemini AI

---

#### **Step 2: Detect Silences**

```bash
# FFmpeg command (via fluent-ffmpeg)
ffmpeg -i audio.flac \
  -af silencedetect=noise=-25dB:d=0.3 \
  -f null -
```

**Parameters**:
- `noise=-25dB`: Threshold (lenient for noisy audio)
- `d=0.3`: Minimum silence duration (0.3s)

**Output Parsing**:
```
[silencedetect @ ...] silence_start: 5.23
[silencedetect @ ...] silence_end: 5.89
```

Parsed into:
```typescript
{ start: 5.23, end: 5.89 }
```

---

#### **Step 3: Split Audio**

**Smart Chunking**:
1. Aim for 3.5 minute chunks
2. Split at silence closest to target
3. Add 20s overlap to prevent missing words at boundaries

**Example**:
```
Total duration: 12 minutes

Chunk 0: 0:00 → 3:30 (no overlap)
Chunk 1: 3:10 → 6:50 (20s overlap with chunk 0)
Chunk 2: 6:30 → 10:10 (20s overlap with chunk 1)
Chunk 3: 9:50 → 12:00 (20s overlap with chunk 2, includes tail)
```

---

#### **Step 4: Transcribe Chunks**

**Gemini AI Prompt** (simplified):

```
Transcribe this audio to SRT subtitle format.

Language: [English / Auto-detect]

Requirements:
- Maximum 2 lines per subtitle
- Maximum 8 words per line
- Minimum 1 second display time
- Start index at 1
- Use proper grammar and capitalization
- Timestamps accurate to nearest 0.1 second

Format:
1
00:00:01,200 --> 00:00:03,500
Your subtitle text here.

2
00:00:03,800 --> 00:00:06,100
Next subtitle text.
```

**Response**: Raw SRT text

---

#### **Step 5: Parse SRT**

```typescript
function parseTranscription(text: string, startOffset: number): Subtitle[] {
  // Regex to match SRT blocks
  const pattern = /(\d+)\s+([\d:,]+)\s+-->\s+([\d:,]+)\s+([\s\S]+?)(?=\n\n|\n*$)/g;
  
  // Parse each block
  // Adjust timestamps by startOffset (chunk.startTime)
  // Return Subtitle[]
}
```

---

#### **Step 6: Merge Chunks**

**Challenge**: Overlapping chunks may have duplicate/conflicting subtitles

**Solution**: Smart stitching algorithm
1. Process chunks pairwise (0+1, result+2, etc.)
2. Identify boundary subtitles (overlap zone)
3. **If duplicate** (similar text + time): Keep one
4. **If partial overlap**: Trim earlier subtitle, keep later
5. Enforce minimum gap (0.05s)

---

#### **Step 7: Enforce Quality**

**Rules**:
- Subtitles must be readable (12+ chars/sec)
- Min duration: 1s
- Max duration: 7s
- Max 2 lines, 42 chars/line
- Merge short consecutive subtitles if gap < 1s
- Extend short subtitles into available space

**Example Fixes**:

Before:
```
1. 00:00:01,000 → 00:00:01,500  (0.5s duration - too short!)
   "Hello"

2. 00:00:01,600 → 00:00:02,100  (0.5s duration - too short!)
   "there"
```

After:
```
1. 00:00:01,000 → 00:00:02,100  (1.1s duration)
   "Hello there"
```

---

#### **Step 8: Heal Gaps**

**Scenario**: Gap from 1:23 to 1:30 (7 seconds) not covered by subtitles or silences

**Action**:
1. Extract audio from 1:22.5 to 1:30.5 (with 0.5s buffer)
2. Transcribe using Gemini AI
3. Parse new subtitles
4. Insert into timeline
5. Resolve overlaps

**Result**: Complete subtitle coverage

---

### Processing Time Estimates

| File Duration | Chunks | Transcription Time | Total Time |
|---------------|--------|-------------------|------------|
| 5 minutes | 2 | ~30 seconds | ~1 minute |
| 15 minutes | 5 | ~1.5 minutes | ~2.5 minutes |
| 30 minutes | 9 | ~3 minutes | ~5 minutes |
| 60 minutes | 18 | ~6 minutes | ~10 minutes |

*Times vary based on network speed and Gemini API response time*

---

### API Cost Estimates

**Pricing** (approximate):
- **Gemini 2.5 Flash**: $0.30/1M output tokens
- **Gemini 2.5 Pro**: $5.00/1M output tokens

**Calculation**:
```typescript
// ~80 tokens per second of audio output
// + ~100 tokens for prompt per chunk

chunks = ceil(duration / 75)  // 75s average chunk
tokens = chunks * (80 * 75 + 100)
cost = (tokens / 1_000_000) * rate
```

**Examples**:

| Duration | Model | Estimated Cost |
|----------|-------|----------------|
| 10 min | Flash | $0.03 |
| 10 min | Pro | $0.50 |
| 60 min | Flash | $0.18 |
| 60 min | Pro | $3.00 |

---

## Appendix

### Type Definitions

```typescript
// src/types.ts

export interface Subtitle {
  id: string;
  index: number;
  startTime: number;  // seconds
  endTime: number;    // seconds
  text: string;
}

export interface AudioChunk {
  index: number;
  startTime: number;
  endTime: number;
  filePath: string;
  overlap: number;
}

export type ProcessingStatus =
  | 'idle'
  | 'extracting'
  | 'detecting-silences'
  | 'splitting'
  | 'transcribing'
  | 'merging'
  | 'healing'
  | 'done'
  | 'error';

export interface ProcessingState {
  status: ProcessingStatus;
  progress: number;  // 0-100
  currentChunk?: number;
  totalChunks?: number;
  error?: string;
}

export interface AppSettings {
  apiKey: string;
  model: 'gemini-2.5-flash' | 'gemini-2.5-pro';
  language: string;
  autoDetectLanguage: boolean;
}

export interface MediaFile {
  path: string;
  name: string;
  ext: string;
  size: number;
  duration: number;
  isVideo: boolean;
}

export interface SilenceSegment {
  start: number;
  end: number;
}
```

---

### Build & Deployment

**Development**:
```bash
npm run dev
# Starts Vite dev server + Electron
# Hot reload enabled
```

**Production Build**:
```bash
npm run build:electron
# Builds React app → dist/
# Compiles Electron → dist-electron/
# Packages app → release/
```

**Platform Targets**:
- **macOS**: DMG installer
- **Windows**: NSIS installer (x64)
- **Linux**: AppImage (x64)

**Binary Bundling**:
- FFmpeg and ffprobe binaries are platform-specific
- Included via `extraResources` in electron-builder config
- Paths set dynamically based on `app.isPackaged`

---

### Planned Features
- [ ] **Dark/light theme toggle**
- [ ] **Translation**: Option to translate subtitles *after* generation (e.g., Generate English → Translate to Spanish)
- [ ] **Waveform visualization**: For audio-only files to aid navigation
- [ ] **Advanced editing**: Split and merge tools (currently missing from editor)

### Completed Features
- [x] **Subtitle export formats** (WebVTT, ASS)
- [x] **Keyboard shortcuts** (Play/pause, seek, insert/delete, Undo/Redo)

### Under Consideration
- [ ] **Multi-track subtitles**: Support for multiple languages in one project. *Requires planning on UI and "Auto-detect" logic.*
- [ ] **Speaker diarization**: Identify different speakers. *Requires research into robust audio segmentation and speaker signature usage.*

### Low Priority / Future
- [ ] **Batch processing**: Processing multiple files in queue.
- [ ] **Custom AI prompts**: User-configurable system prompts.

---

## Credits

**Application**: Subtitles Generator  
**Version**: 1.0.0  
**License**: MIT License (Copyright © 2026 Subtitles Gen)
**Developed by**: Stas Krylov

**Tech Stack**:
- Electron, React, TypeScript, Vite
- Google Gemini AI (Intelligence)
- FFmpeg (Media Processing)

**Acknowledgments**:
Built with the assistance of Anthropic's Claude 3.5 Sonnet and Google's Gemini models via Antigravity.

---

*End of Documentation*
