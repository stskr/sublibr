# Code Review — SUBLIBR

> **Date**: February 17, 2026
> **Scope**: Full codebase (27 source files)

---

## Critical

### 1. ~~Security: `file:registerPath` bypasses filesystem protections~~ FIXED
**Files**: `electron/main.ts:281`, `electron/preload.ts:24`

Restricted `registerPath` to only accept media file extensions.

---

### 2. ~~Security: API keys exposed in renderer process~~ FIXED
**Files**: `src/services/providers.ts`, `electron/main.ts`, `electron/preload.ts`, `src/vite-env.d.ts`

All API calls (testApiKey + callProvider) proxied through the main process via IPC handlers. Renderer never makes direct HTTP requests; `net.fetch` in main process is invisible in DevTools. Removed `anthropic-dangerous-direct-browser-access` header and `@google/generative-ai` SDK from renderer.

**Update**: API keys are now also encrypted at rest using Electron `safeStorage`.

---

### 3. ~~Memory: Large files loaded as base64 data URLs~~ FIXED
**Files**: `src/components/SubtitlePreview.tsx:30`, `src/components/AudioPlayer.tsx:31`, `electron/main.ts`

**Fix**: Implemented `media://` custom protocol to stream files from disk, bypassing V8 memory limits. Removed `readFileAsDataUrl`.

---

## High

### 4. ~~Bug: Audio extraction outputs FLAC with `.mp3` extension~~ FIXED
**Files**: `src/App.tsx`, `src/services/healer.ts`

Changed extensions to `.flac` in both files.

---

### 5. ~~Bug: Undo/Redo shortcuts fire inside text inputs~~ FIXED
**Files**: `src/hooks/useKeyboardShortcuts.ts`

Moved `isInput` check before undo/redo handlers. Also fixed deprecated `navigator.platform` (#20).

---

### 6. ~~Bug: Time inputs are unusable for manual editing~~ FIXED
**Files**: `src/components/SubtitleEditor.tsx`

Switched to `defaultValue` + `onBlur` with `key` props for re-render on external changes.

---

### 7. ~~Memory leak: IPC event listeners never cleaned up~~ FIXED
**Files**: `electron/preload.ts`, `src/components/UpdateNotification.tsx`, `src/vite-env.d.ts`

All `on*` methods now return cleanup functions; UpdateNotification calls them in useEffect return.

---

## Medium

### 8. ~~Bug: Stale closure in `handleGenerate`~~ FIXED
**Files**: `src/App.tsx`

Added `mediaFile`, `addToRecents`, `setSubtitles` to dependency array.

---

### 9. ~~Bug: Sidebar language changes not persisted~~ FIXED
**Files**: `src/App.tsx`

Language changes now persist to Electron store.

---

### 10. ~~Bug: Save dialog hardcodes SRT filter~~ FIXED
**Files**: `electron/main.ts`, `electron/preload.ts`, `src/App.tsx`, `src/vite-env.d.ts`

Dialog now receives filter name and extensions dynamically based on export format.

---

### 11. ~~Performance: Unbounded undo history~~ FIXED
**Files**: `src/hooks/useUndoRedo.ts`

Capped `past` at 50 entries.

---

### 12. ~~Bug: Duplicate inconsistent `MODEL_PRICING`~~ FIXED
**Files**: `src/utils.ts`

Removed standalone `MODEL_PRICING` map; `estimateCost` now uses corrected output rates aligned with `providers.ts`.

---

### 13. ~~Bug: Hardcoded "Gemini" in progress message~~ FIXED
**Files**: `src/components/ProgressIndicator.tsx`

Changed fallback to generic "Transcribing...".

---

### 14. ~~Performance: `audioToBase64` O(n^2) string concatenation~~ FIXED
**Files**: `src/services/transcriber.ts`

Replaced byte-by-byte loop with chunked `String.fromCharCode.apply` in 8192-byte batches.

---

## Low

### 15. ~~CSS: Undefined variable `--color-text`~~ FIXED
**Files**: `src/App.css`

Changed to `var(--color-text-primary)`.

---

### 16. ~~CSS: Duplicate `.control-btn:hover` rules~~ FIXED
**Files**: `src/App.css`

Removed first duplicate set of rules.

---

### 17. ~~Dead code~~ FIXED
**Files**: `src/components/VideoPreview.tsx`, `src/components/MarqueeText.tsx`, `src/components/MarqueeText.css`

Deleted all three files.

---

### 18. Code smell: Global `window.seekAudio`/`window.toggleAudio` — DEFERRED
**Files**: `src/components/AudioPlayer.tsx`, `src/App.tsx`

Components communicate via global window properties instead of React context or refs. Low risk but architectural debt.

---

### 19. ~~Bug: `LanguageSelector` input snaps back~~ FIXED
**Files**: `src/components/LanguageSelector.tsx`

**Fix**: Decoupled search input state from selected language prop. Input now maintains its own state and only reverts on blur if no selection is made.

---

### 20. Version history is in-memory only — DEFERRED
**Files**: `src/App.tsx`

Subtitle versions are not persisted to `electron-store`. Reloading the app clears all versions except the currently active one (which is cached as the 'generated' state).

---

---

### 20. ~~Deprecated API: `navigator.platform`~~ FIXED
**Files**: `src/hooks/useKeyboardShortcuts.ts`

Replaced with `/mac/i.test(navigator.userAgent)`.

---

### 21. ~~Temp file leak~~ FIXED
**Files**: `electron/main.ts`

Added `subtitles_gen_audio_*` and `gap_heal_*.flac` patterns to cleanup regex.

---

### 22. ~~Security: API keys stored in plaintext~~ FIXED
**Files**: `electron/main.ts`

API keys are now encrypted at rest using Electron's `safeStorage` API (OS keychain). Encryption/decryption is transparent — applied in `store:get`/`store:set` handlers. Existing plaintext keys auto-migrate on next save. Falls back to plaintext if OS encryption is unavailable.

---

### 23. ~~ShortcutsModal shows wrong modifier key~~ FIXED
**Files**: `src/components/ShortcutsModal.tsx`

Now detects macOS and shows `⌘` instead of `Ctrl`.

---

### 24. ~~`VideoPreview` uses blocked `file://` protocol~~ FIXED (removed)
**Files**: `src/components/VideoPreview.tsx`

Component was dead code and has been deleted (#17).

---

### 25. ~~Dead `media-end-marker` div in SubtitleEditor~~ FIXED
**Files**: `src/components/SubtitleEditor.tsx`

Removed dead div and associated comments. Also removed unused `duration` prop from SubtitleEditor.

---

## Summary

- **Fixed**: 24 of 26 issues
- **Deferred** (architectural changes): 18, 20
