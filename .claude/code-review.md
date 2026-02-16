# Code Review — SUBLIBR

> **Date**: February 17, 2026
> **Scope**: Full codebase (27 source files)

---

## Critical

### 1. Security: `file:registerPath` bypasses filesystem protections
**Files**: `electron/main.ts:281`, `electron/preload.ts:24`

The renderer can register *any* path as "allowed", completely defeating the path validation system. A compromised renderer could call `registerPath('/etc/passwd')` then `readFile('/etc/passwd')` to read arbitrary files.

**Fix**: Remove `registerPath` or validate that registered paths are actual media files. Track dropped file paths in the main process via `webContents` events instead.

---

### 2. Security: API keys exposed in renderer process
**Files**: `src/services/providers.ts`

All API calls are made directly from the renderer via `fetch`. Keys are visible in DevTools, network inspector, and memory. The `anthropic-dangerous-direct-browser-access: 'true'` header literally warns in its name that this is dangerous.

**Fix**: Proxy all API calls through the main process via IPC handlers. Store keys using Electron's `safeStorage` API.

---

### 3. Memory: Large files loaded as base64 data URLs
**Files**: `src/components/SubtitlePreview.tsx:30`, `src/components/AudioPlayer.tsx:31`

`readFileAsDataUrl` converts entire files to base64 strings (~33% size overhead). A 1GB video becomes a ~1.33GB string in memory. This will crash the app on large files.

**Fix**: Use an Electron custom protocol handler to serve files via streaming.

---

## High

### 4. Bug: Audio extraction outputs FLAC with `.mp3` extension
**Files**: `src/App.tsx:168`, `src/services/healer.ts:104`

`extractAudio` always produces FLAC codec, but callers use `.mp3` extensions. `readFileAsDataUrl` infers MIME type from the extension, sending `audio/mpeg` for FLAC data, potentially breaking playback.

**Fix**: Change the extension to `.flac`.

---

### 5. Bug: Undo/Redo shortcuts fire inside text inputs
**Files**: `src/hooks/useKeyboardShortcuts.ts:27-31`

The `isInput` check is placed *after* the Undo/Redo/Save handlers. Pressing `Ctrl+Z` while editing a subtitle textarea triggers app-level undo (replacing the entire subtitle array) instead of the expected textarea undo.

**Fix**: Move the `isInput` early-return check before the undo/redo handlers.

---

### 6. Bug: Time inputs are unusable for manual editing
**Files**: `src/components/SubtitleEditor.tsx:118-119`

Controlled inputs call `parseSrtTime` on every keystroke. Incomplete input like `00:01:3` doesn't match the regex, returning `0`, which resets the display to `00:00:00,000` mid-typing.

**Fix**: Use `defaultValue` + `onBlur` instead of a controlled `value` + `onChange`.

---

### 7. Memory leak: IPC event listeners never cleaned up
**Files**: `electron/preload.ts:37-57`, `src/components/UpdateNotification.tsx:17-39`

`on*` methods add listeners but provide no way to remove them. On component remount, listeners accumulate indefinitely.

**Fix**: Return cleanup functions from the preload `on*` methods and call them in `useEffect` return.

---

## Medium

### 8. Bug: Stale closure in `handleGenerate`
**Files**: `src/App.tsx:275`

`mediaFile` and `addToRecents` are not in the dependency array, so the `addToRecents(mediaFile, 'generated')` call captures stale values.

**Fix**: Add `mediaFile` and `addToRecents` to the dependency array.

---

### 9. Bug: Sidebar language changes not persisted
**Files**: `src/App.tsx:503`

The sidebar `LanguageSelector` `onChange` updates React state but doesn't save to Electron store (unlike `handleSettingsChange`). Language choice is lost on restart.

**Fix**: Call `window.electronAPI.setStoreValue('settings', ...)` after updating state.

---

### 10. Bug: Save dialog hardcodes SRT filter
**Files**: `electron/main.ts:223`

When exporting VTT or ASS, the dialog still shows "SRT Subtitle" as the file type filter.

**Fix**: Pass the export format to the IPC handler and set the filter dynamically.

---

### 11. Performance: Unbounded undo history
**Files**: `src/hooks/useUndoRedo.ts:56`

Every edit pushes the full `Subtitle[]` into `past` with no limit. Long editing sessions will accumulate large memory.

**Fix**: Cap `past` at ~50 entries.

---

### 12. Bug: Duplicate inconsistent `MODEL_PRICING`
**Files**: `src/utils.ts:78-85` vs `src/services/providers.ts:35-45`

Two separate pricing maps exist with different structures (flat number vs `{input, output}` object). The `estimateCost` in utils uses the flat rate, giving inaccurate cost previews.

**Fix**: Remove the duplicate from `utils.ts` and refactor `estimateCost` to use the canonical pricing from `providers.ts`.

---

### 13. Bug: Hardcoded "Gemini" in progress message
**Files**: `src/components/ProgressIndicator.tsx:24`

Default fallback shows "Transcribing with Gemini..." even when using Anthropic or OpenAI.

**Fix**: Change to generic "Transcribing..." since the dynamic `providerLabel` override handles the specific case.

---

### 14. Performance: `audioToBase64` O(n^2) string concatenation
**Files**: `src/services/transcriber.ts:14-19`

Builds a base64 string via `binary += String.fromCharCode(bytes[i])` in a loop. For 20-40MB chunks, this is extremely slow and may crash.

**Fix**: Use chunked `String.fromCharCode.apply` or process in batches of 8192 bytes.

---

## Low

### 15. CSS: Undefined variable `--color-text`
**Files**: `src/App.css:1763`

`.sidebar-back-btn:hover` uses `var(--color-text)` which doesn't exist in `:root`.

**Fix**: Change to `var(--color-text-primary)`.

---

### 16. CSS: Duplicate `.control-btn:hover` rules
**Files**: `src/App.css:1136/1152`

First rule is dead code, overridden by the second declaration. Same for `.control-btn.play:hover` (lines 1148/1157).

**Fix**: Remove the first set of duplicate rules.

---

### 17. Dead code
**Files**: `src/components/VideoPreview.tsx`, `src/components/MarqueeText.tsx`

`VideoPreview` is no longer imported anywhere after the inline preview refactor. `MarqueeText` also appears unused.

**Fix**: Remove or re-integrate these components.

---

### 18. Code smell: Global `window.seekAudio`/`window.toggleAudio`
**Files**: `src/components/AudioPlayer.tsx:150-159`, `src/App.tsx:366-384`

Components communicate via global window properties instead of React context or refs.

**Fix**: Use a React context or ref-based approach for cross-component communication.

---

### 19. Bug: `LanguageSelector` input snaps back
**Files**: `src/components/LanguageSelector.tsx:62`

Clearing the search field immediately repopulates it with the current language because `languageSearch || language` is falsy when empty string.

**Fix**: Use separate controlled state for the search input vs the selected language.

---

### 20. Deprecated API: `navigator.platform`
**Files**: `src/hooks/useKeyboardShortcuts.ts:24`

`navigator.platform` is deprecated. Should use `navigator.userAgentData?.platform` or similar.

---

### 21. Temp file leak
**Files**: `electron/main.ts:119-126`

The cleanup regex matches `chunk_*.flac` and `gap_heal_*.mp3` but not `subtitles_gen_audio_*` files created during audio extraction. These temp files are never cleaned up.

**Fix**: Add the `subtitles_gen_audio_*` pattern to the cleanup logic.

---

### 22. Security: API keys stored in plaintext
**Files**: `electron/main.ts:62`

`electron-store` saves to unencrypted JSON on disk. API keys are readable by any process with filesystem access.

**Fix**: Use `safeStorage.encryptString()` for sensitive values.

---

### 23. ShortcutsModal shows wrong modifier key
**Files**: `src/components/ShortcutsModal.tsx:39-40`

Shortcuts display `Ctrl` on all platforms, but the actual handler uses `metaKey` (Cmd) on macOS.

**Fix**: Detect platform and show `Cmd` vs `Ctrl` accordingly.

---

### 24. `VideoPreview` uses blocked `file://` protocol
**Files**: `src/components/VideoPreview.tsx:68`

`src={`file://${videoPath}`}` is blocked by Electron's `sandbox: true`. The rest of the codebase uses `readFileAsDataUrl` for this reason.

**Fix**: Remove the component (dead code) or fix to use `readFileAsDataUrl`.

---

### 25. Dead `media-end-marker` div in SubtitleEditor
**Files**: `src/components/SubtitleEditor.tsx:86-98`

A div is rendered with `display: 'none'` inline style plus a comment explaining why it doesn't work. Pure dead code.

**Fix**: Remove entirely.
