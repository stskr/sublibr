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

### 18. ~~Code smell: Global `window.seekAudio`/`window.toggleAudio`~~ FIXED
**Files**: `src/components/AudioPlayer.tsx`, `src/App.tsx`

**Fix**: Refactored `AudioPlayer` to expose `seek` and `togglePlay` methods via `forwardRef`/`useImperativeHandle`. `App.tsx` now uses a React `ref` to control the player instead of global window properties.

---

### 19. ~~Bug: `LanguageSelector` input snaps back~~ FIXED
**Files**: `src/components/LanguageSelector.tsx`

**Fix**: Decoupled search input state from selected language prop. Input now maintains its own state and only reverts on blur if no selection is made.

---

### 20. ~~Version history is in-memory only~~ FIXED
**Files**: `src/App.tsx`

**Fix**: Implemented `useEffect` to auto-persist `versions` to `subtitle-versions` store key whenever state changes. Versions are restored when loading recent files.

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

- **Fixed**: 26 of 26 issues
- **Deferred** (architectural changes): 0

---

---

# Code Review — Round 2

> **Date**: February 23, 2026
> **Scope**: Full codebase (45 source files)

---

## Medium

### 26. ~~Bug: `isAutoDetect` label check always returns `false` for auto-generated versions~~ FIXED
**Files**: `src/hooks/useTranscriptionPipeline.ts:256`

**Problem**: `handleTranslate` derives `isAutoDetect` by calling `currentVersion.label?.includes('Auto-Detect')`, but `handleGenerate` creates version labels with the suffix `_Auto` (line 210: `` `V${n}-${lang}_Auto, ${model}` ``). The string `'Auto-Detect'` never appears in any label, so `isAutoDetect` is always `false` for version-derived auto-detect.

**Impact**:
1. Translation version labels never use the `_Auto` format — the ternary on line 287 always takes the non-auto branch.
2. The same-language guard on line 259 (`sourceLanguage === translateTargetLang && !isAutoDetect`) can incorrectly block translation when the detected source language happens to match the target.

**Fix**: Change line 256 to check for `'_Auto'`:
```ts
? currentVersion.label?.includes('_Auto')
```

---

### 27. ~~Bug: Temp audio files not cleaned up on mid-run `handleGenerate` failure~~ FIXED
**Files**: `src/hooks/useTranscriptionPipeline.ts:240-244`

**Problem**: The `catch` block at line 240 only updates UI error state. If `handleGenerate` fails after `extractAudio` (line 113) or `createAudioChunks` (line 118) have already written files to disk, those files are never removed. Fix #21 added app-quit cleanup patterns, but per-invocation cleanup on error is absent. Repeated failed attempts (bad API key, network timeout) accumulate `subtitles_gen_audio_*` and chunk files in the OS temp directory until the app restarts.

**Fix**: Add a `finally` or targeted cleanup in the `catch` block to `fs.unlink` `processAudioPath` if it was created during this invocation.

---

## Low

### 28. ~~Bug: `handleTranslate` doesn't guard empty `subtitles`~~ FIXED
**Files**: `src/hooks/useTranscriptionPipeline.ts:249`

**Problem**: `handleTranslate` only checks for a missing API key before proceeding. If `subtitles` is empty (e.g., user clicks Translate before generating), it calls `translateSubtitles([])`, wasting API quota and producing a spurious empty version in history. Compare `handleDownload` which starts with `if (subtitles.length === 0) return`.

**Fix**: Add `if (!subtitles.length) return;` at the top of `handleTranslate`.

---

### 29. ~~UX: Subtitle healing failure silently swallowed~~ FIXED
**Files**: `src/hooks/useTranscriptionPipeline.ts:175-177`

**Problem**: The healing `catch` block only `console.error`s. Users receive no feedback when healing fails; the pipeline continues silently with unhealed subtitles. The progress bar shows the normal "done" state, giving the impression everything succeeded.

**Fix**: Surface a non-blocking warning in `ProcessingState` (e.g., a `warnings` field) or set a transient toast message so the user knows healing was skipped and quality may be lower.

---

### 30. ~~Code quality: `generateId()` uses `Math.random()`~~ FIXED
**Files**: `src/utils.ts:49`

**Problem**: `Math.random().toString(36).substring(2, 11)` yields ~46 bits of randomness. Probability of a collision across, say, 10 000 IDs is ~0.01 % — low but non-zero, and `Math.random` is not cryptographically secure. In large subtitle files (hundreds of entries) with rapid add/delete cycles, the risk is small but real.

**Fix**: Replace with `crypto.randomUUID()` (available in Electron's renderer via the Web Crypto API) or `crypto.getRandomValues`.

---

## Summary

- **Fixed**: 26 of 26 issues (Round 1)
- **Fixed**: 5 of 5 issues (Round 2)
