import { useState, useEffect, useCallback } from 'react';
import { Settings } from './components/Settings';
import { FileUpload } from './components/FileUpload';
import { SubtitleEditor, TimelinePreview } from './components/SubtitleEditor';
import { ShortcutsModal } from './components/ShortcutsModal';
import { AudioPlayer } from './components/AudioPlayer';
import { SubtitlePreview } from './components/SubtitlePreview';
import { ProgressIndicator } from './components/ProgressIndicator';
import { LanguageSelector } from './components/LanguageSelector';
import { CustomSelect } from './components/CustomSelect';
import { createAudioChunks } from './services/audioProcessor';
import { transcribeChunk, mergeSubtitles, enforceSubtitleQuality, generateSrt, generateWebVtt, generateAss } from './services/transcriber';
import { healSubtitles } from './services/healer';
import { parseSubtitleFile } from './services/subtitleParser';
import { useUndoRedo } from './hooks/useUndoRedo';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { generateId, formatDisplayTime, isVideoFile } from './utils';
import type { Subtitle, MediaFile, AppSettings, ProcessingState, RecentFile, TokenUsage, SessionTokenStats } from './types';
import { PROVIDER_LABELS } from './services/providers';
import { TokenUsageDisplay } from './components/TokenUsageDisplay';
import { UpdateNotification } from './components/UpdateNotification';

import './App.css';

import logoWhite from './assets/Logo/logo-white.svg';

const DEFAULT_SETTINGS: AppSettings = {
  activeProvider: 'gemini',
  providers: {
    gemini: { enabled: true, apiKey: '', model: 'gemini-2.5-flash' },
    anthropic: { enabled: false, apiKey: '', model: 'claude-sonnet-4-5-20250929' },
    openai: { enabled: false, apiKey: '', model: 'gpt-4o-mini' },
  },
  language: 'English',
  autoDetectLanguage: false,
};

const MAX_RECENT_FILES = 10;
const DONE_STATUS_DELAY_MS = 2000;
const DEFAULT_SUBTITLE_DURATION = 2; // seconds

function App() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [mediaFile, setMediaFile] = useState<MediaFile | null>(null);
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [subtitles, setSubtitles, undoSubtitles, redoSubtitles, canUndo, canRedo, resetSubtitles] = useUndoRedo<Subtitle[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [processing, setProcessing] = useState<ProcessingState>({ status: 'idle', progress: 0 });
  const [editorView, setEditorView] = useState<'subtitles' | 'preview'>('subtitles');
  const [exportFormat, setExportFormat] = useState<'srt' | 'vtt' | 'ass'>('srt');
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [tokenStats, setTokenStats] = useState<SessionTokenStats>({
    totalInputTokens: 0,
    totalOutputTokens: 0,
    calls: [],
  });

  const addTokenUsage = useCallback((usage: TokenUsage) => {
    setTokenStats(prev => ({
      totalInputTokens: prev.totalInputTokens + usage.inputTokens,
      totalOutputTokens: prev.totalOutputTokens + usage.outputTokens,
      calls: [...prev.calls, usage],
    }));
  }, []);

  // Load settings and recents on mount
  useEffect(() => {
    async function loadFromStore() {
      // Guard: only load from electron store if running in Electron
      if (!window.electronAPI) {
        console.warn('Running in browser mode - Electron APIs not available');
        return;
      }

      // Load settings
      const saved = await window.electronAPI.getStoreValue('settings') as Record<string, unknown> | null;
      if (saved) {
        // Migrate old flat format (apiKey/model) to new multi-provider format
        if ('apiKey' in saved && !('providers' in saved)) {
          const migrated: AppSettings = {
            ...DEFAULT_SETTINGS,
            providers: {
              ...DEFAULT_SETTINGS.providers,
              gemini: {
                enabled: true,
                apiKey: (saved.apiKey as string) || '',
                model: (saved.model as string) || 'gemini-2.5-flash',
              },
            },
            language: (saved.language as string) || 'English',
            autoDetectLanguage: (saved.autoDetectLanguage as boolean) ?? false,
          };
          setSettings(migrated);
          await window.electronAPI.setStoreValue('settings', migrated);
        } else {
          setSettings({ ...DEFAULT_SETTINGS, ...(saved as Partial<AppSettings>) });
        }
      }

      // Load recent files
      const savedRecents = await window.electronAPI.getStoreValue('recent-files') as RecentFile[] | null;
      if (savedRecents?.length) {
        setRecentFiles(savedRecents);
      }
    }
    loadFromStore();
  }, []);

  // Save settings
  const handleSettingsChange = useCallback(async (newSettings: AppSettings) => {
    setSettings(newSettings);
    if (window.electronAPI) {
      await window.electronAPI.setStoreValue('settings', newSettings);
    }
  }, []);

  // Add to recent files
  const addToRecents = useCallback(async (file: MediaFile, action: 'generated' | 'opened', subtitleCount?: number) => {
    const newRecent: RecentFile = {
      path: file.path,
      name: file.name,
      date: Date.now(),
      lastAction: action,
      ...(subtitleCount != null && { subtitleCount }),
    };

    setRecentFiles(prev => {
      // Remove existing if present (to move to top)
      const filtered = prev.filter(f => f.path !== file.path);
      const updated = [newRecent, ...filtered].slice(0, MAX_RECENT_FILES);

      if (window.electronAPI) {
        window.electronAPI.setStoreValue('recent-files', updated).catch(() => { });
      }
      return updated;
    });
  }, []);

  // Load a recent file
  const handleLoadRecent = useCallback(async (recent: RecentFile) => {
    if (!window.electronAPI) return;

    try {
      // Register the path so the main process allows access on fresh launches
      await window.electronAPI.registerPath(recent.path);

      // Get file info to verify it still exists
      const info = await window.electronAPI.getFileInfo(recent.path);
      const duration = await window.electronAPI.getDuration(recent.path);

      const mediaFile: MediaFile = {
        path: info.path,
        name: info.name,
        ext: info.ext,
        size: info.size,
        duration,
        isVideo: isVideoFile(info.ext),
      };

      setMediaFile(mediaFile);
      setDuration(duration);
      setAudioPath(null); // Reset audio path so it gets extracted if needed

      // Restore cached subtitles if available
      const cache = (await window.electronAPI.getStoreValue('subtitle-cache') || {}) as Record<string, Subtitle[]>;
      const cached = cache[recent.path];
      if (cached?.length) {
        resetSubtitles(cached);
      } else {
        resetSubtitles([]);
      }
    } catch (error) {
      console.error('Failed to load recent file:', error);
    }
  }, [resetSubtitles]);

  // Clear recents list
  const handleClearRecents = useCallback(async () => {
    setRecentFiles([]);
    if (window.electronAPI) {
      await window.electronAPI.setStoreValue('recent-files', []);
    }
  }, []);

  // Clear subtitle cache
  const handleClearCache = useCallback(async () => {
    if (window.electronAPI) {
      await window.electronAPI.deleteStoreValue('subtitle-cache');
    }
    // Update recents to remove subtitleCount indicators
    setRecentFiles(prev => {
      const updated = prev.map(f => {
        const { subtitleCount: _, ...rest } = f;
        return rest;
      });
      if (window.electronAPI) {
        window.electronAPI.setStoreValue('recent-files', updated).catch(() => { });
      }
      return updated;
    });
  }, []);

  // Handle file selection
  const handleFileSelect = useCallback(async (file: MediaFile) => {
    setMediaFile(file);
    resetSubtitles([]);
    setDuration(file.duration);

    // If it's a video, extract audio; otherwise use directly
    if (file.isVideo) {
      setProcessing({ status: 'extracting', progress: 10 });
      try {
        const tempDir = await window.electronAPI.getTempPath();
        const audioOutput = `${tempDir}/subtitles_gen_audio_${Date.now()}.flac`;
        await window.electronAPI.extractAudio(file.path, audioOutput);
        setAudioPath(audioOutput);
        setProcessing({ status: 'idle', progress: 0 });
      } catch (error) {
        setProcessing({
          status: 'error',
          progress: 0,
          error: error instanceof Error ? error.message : 'Failed to extract audio'
        });
      }
    } else {
      setAudioPath(file.path);
    }
  }, []);

  // Generate subtitles
  const handleGenerate = useCallback(async () => {
    const activeConfig = settings.providers[settings.activeProvider];
    if (!audioPath || !activeConfig.apiKey) {
      if (!activeConfig.apiKey) {
        setShowSettings(true);
      }
      return;
    }

    const { apiKey, model } = activeConfig;
    const provider = settings.activeProvider;

    try {
      // Step 1: Detect silences and split into chunks
      const tempDir = await window.electronAPI.getTempPath();
      setProcessing({ status: 'detecting-silences', progress: 15 });
      const { chunks, silences } = await createAudioChunks(audioPath, tempDir);

      // Step 2: Transcribe each chunk
      const allSubtitles: Subtitle[][] = [];
      const totalChunks = chunks.length;

      for (let i = 0; i < chunks.length; i++) {
        setProcessing({
          status: 'transcribing',
          progress: 30 + ((i / totalChunks) * 60),
          currentChunk: i + 1,
          totalChunks,
        });

        const result = await transcribeChunk(
          chunks[i],
          provider,
          apiKey,
          model,
          settings.language,
          settings.autoDetectLanguage
        );
        allSubtitles.push(result.subtitles);
        addTokenUsage(result.tokenUsage);
      }

      // Step 3: Merge subtitles
      setProcessing({ status: 'merging', progress: 90 });
      let merged = mergeSubtitles(allSubtitles);

      // Step 4: Heal Gaps
      setProcessing({ status: 'healing', progress: 95 });
      try {
        const healResult = await healSubtitles(
          merged,
          audioPath,
          silences,
          provider,
          apiKey,
          model,
          settings.language,
          settings.autoDetectLanguage
        );
        merged = healResult.subtitles;
        healResult.tokenUsages.forEach(addTokenUsage);
      } catch (err) {
        console.error('Healing failed:', err);
        // Continue with merged subtitles even if healing fails
      }

      // Step 5: Enforce subtitle quality (min duration, merge short subs, punctuation)
      merged = enforceSubtitleQuality(merged);

      setSubtitles(merged);
      setProcessing({ status: 'done', progress: 100 });
      if (mediaFile) {
        addToRecents(mediaFile, 'generated', merged.length);
        // Cache subtitles for later restoration
        const cache = (await window.electronAPI.getStoreValue('subtitle-cache') || {}) as Record<string, Subtitle[]>;
        cache[mediaFile.path] = merged;
        window.electronAPI.setStoreValue('subtitle-cache', cache).catch(() => { });
      }

      // Reset after brief delay
      setTimeout(() => {
        setProcessing({ status: 'idle', progress: 0 });
      }, DONE_STATUS_DELAY_MS);

    } catch (error) {
      setProcessing({
        status: 'error',
        progress: 0,
        error: error instanceof Error ? error.message : 'Transcription failed',
      });
    }
  }, [audioPath, settings, addTokenUsage, mediaFile, addToRecents, setSubtitles]);

  // Load subtitles from file
  const handleLoadSubtitles = useCallback(async () => {
    if (!window.electronAPI) return;

    const filePath = await window.electronAPI.openSubtitleFileDialog();
    if (!filePath) return;

    try {
      const buffer = await window.electronAPI.readFile(filePath);
      const text = new TextDecoder('utf-8').decode(new Uint8Array(buffer));
      const ext = filePath.split('.').pop() || '';
      const loaded = parseSubtitleFile(text, ext);

      if (loaded.length === 0) {
        setProcessing({
          status: 'error',
          progress: 0,
          error: 'No subtitles found in the file. Please check the file format.',
        });
        return;
      }

      // Check for duration mismatch
      if (mediaFile && loaded.length > 0) {
        const lastSubtitle = loaded[loaded.length - 1];
        if (lastSubtitle.endTime > mediaFile.duration) {
          const response = await window.electronAPI.showMessageBox({
            type: 'warning',
            buttons: ['Load Anyway', 'Cancel'],
            defaultId: 0,
            cancelId: 1,
            title: 'Subtitle Duration Warning',
            message: 'Subtitles are longer than the media file',
            detail: `The text ends at ${formatDisplayTime(lastSubtitle.endTime)}, but the media ends at ${formatDisplayTime(mediaFile.duration)}.\n\nDo you want to continue?`,
          });

          if (response.response === 1) {
            return; // User cancelled
          }
        }
      }

      setSubtitles(loaded);
      if (mediaFile) {
        addToRecents(mediaFile, 'opened');
      }
    } catch (err) {
      setProcessing({
        status: 'error',
        progress: 0,
        error: err instanceof Error ? err.message : 'Failed to load subtitle file',
      });
    }
  }, [setSubtitles, mediaFile, addToRecents]);

  // Download subtitles
  const handleDownload = useCallback(async () => {
    if (subtitles.length === 0) return;

    let ext = '.srt';
    let content = '';

    switch (exportFormat) {
      case 'vtt':
        ext = '.vtt';
        content = generateWebVtt(subtitles);
        break;
      case 'ass':
        ext = '.ass';
        content = generateAss(subtitles);
        break;
      case 'srt':
      default:
        ext = '.srt';
        content = generateSrt(subtitles);
        break;
    }

    const defaultName = mediaFile
      ? mediaFile.name.replace(/\.[^.]+$/, ext)
      : `subtitles${ext}`;

    const formatNames: Record<string, string> = { srt: 'SRT Subtitle', vtt: 'WebVTT Subtitle', ass: 'ASS Subtitle' };
    const savePath = await window.electronAPI.saveFileDialog(defaultName, formatNames[exportFormat], [exportFormat]);
    if (savePath) {
      await window.electronAPI.writeFile(savePath, content);
    }
  }, [subtitles, mediaFile, exportFormat]);

  // Seek audio
  const handleSeek = useCallback((time: number) => {
    setCurrentTime(time);
    const seekFn = (window as { seekAudio?: (time: number) => void }).seekAudio;
    if (seekFn) seekFn(time);
  }, []);

  // Keyboard Shortcuts Handlers
  const handleUndo = useCallback(() => {
    if (canUndo) undoSubtitles();
  }, [canUndo, undoSubtitles]);

  const handleRedo = useCallback(() => {
    if (canRedo) redoSubtitles();
  }, [canRedo, redoSubtitles]);

  const handlePlayPause = useCallback(() => {
    const toggleFn = (window as { toggleAudio?: () => void }).toggleAudio;
    if (toggleFn) toggleFn();
  }, []);

  const handleSeekBackward = useCallback(() => {
    handleSeek(Math.max(0, currentTime - 5));
  }, [currentTime, handleSeek]);

  const handleSeekForward = useCallback(() => {
    handleSeek(Math.min(duration, currentTime + 5));
  }, [currentTime, duration, handleSeek]);

  const handleInsertSubtitle = useCallback(() => {
    const newId = generateId();
    // Insert at current time
    // Find where to insert
    const insertIndex = subtitles.findIndex(s => s.startTime > currentTime);

    // Default: 2 seconds duration
    let startTime = currentTime;
    // Avoid overlap with previous if possible
    const prevSub = subtitles[insertIndex - 1] || subtitles[subtitles.length - 1];
    if (prevSub && prevSub.endTime > startTime) {
      startTime = prevSub.endTime + 0.1;
    }

    const newSub: Subtitle = {
      id: newId,
      index: 0,
      startTime: startTime,
      endTime: startTime + DEFAULT_SUBTITLE_DURATION,
      text: ''
    };

    const newSubtitles = [...subtitles];
    if (insertIndex === -1) {
      newSubtitles.push(newSub);
    } else {
      newSubtitles.splice(insertIndex, 0, newSub);
    }

    // Re-index
    const reindexed = newSubtitles.map((s, i) => ({ ...s, index: i + 1 }));
    setSubtitles(reindexed);
  }, [subtitles, currentTime, setSubtitles]);

  const handleDeleteSubtitle = useCallback(() => {
    // Find subtitle active at current time
    const activeSub = subtitles.find(s => currentTime >= s.startTime && currentTime <= s.endTime);
    if (activeSub) {
      const filtered = subtitles.filter(s => s.id !== activeSub.id).map((s, i) => ({ ...s, index: i + 1 }));
      setSubtitles(filtered);
    }
  }, [subtitles, currentTime, setSubtitles]);

  useKeyboardShortcuts({
    onUndo: handleUndo,
    onRedo: handleRedo,
    onSave: handleDownload, // Shortcut for saving/downloading
    onPlayPause: handlePlayPause,
    onSeekBackward: handleSeekBackward,
    onSeekForward: handleSeekForward,
    onInsertSubtitle: handleInsertSubtitle,
    onDeleteSubtitle: handleDeleteSubtitle
  });

  const activeConfig = settings.providers[settings.activeProvider];
  const canGenerate = audioPath && activeConfig.enabled && activeConfig.apiKey && processing.status === 'idle';
  const isProcessing = processing.status !== 'idle' && processing.status !== 'done' && processing.status !== 'error';

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-brand">
          <h1><img src={logoWhite} alt="SUBLIBR Logo" style={{ height: '18px' }} /> SUBLIBR</h1>
        </div>
        <div className="header-actions">
          <button className="btn-icon" onClick={() => setShowShortcuts(true)} title="Keyboard Shortcuts" aria-label="Keyboard Shortcuts">
            <span className="icon">keyboard</span>
          </button>
          <button className="btn-icon" onClick={() => setShowSettings(true)} title="Settings" aria-label="Settings">
            <span className="icon">settings</span>
          </button>
        </div>
      </header >

      <UpdateNotification />

      <main className="app-main">
        {!mediaFile ? (
          <FileUpload
            settings={settings}
            onFileSelect={handleFileSelect}
            recentFiles={recentFiles}
            onLoadRecent={handleLoadRecent}
            onClearRecents={handleClearRecents}
            onClearCache={handleClearCache}
          />
        ) : (
          <div className="editor-container">
            <div className="editor-sidebar">
              <button
                className="sidebar-back-btn"
                onClick={() => {
                  setMediaFile(null);
                  setAudioPath(null);
                  resetSubtitles([]);
                  setCurrentTime(0);
                  setDuration(0);
                  setProcessing({ status: 'idle', progress: 0 });
                }}
                title="Back to main screen"
                aria-label="Back to Home"
              >
                <span className="icon icon-sm">arrow_back</span>
                Back to Home
              </button>

              {!isProcessing && subtitles.length === 0 && (
                <div className="sidebar-section">
                  <LanguageSelector
                    language={settings.language}
                    autoDetect={settings.autoDetectLanguage}
                    onLanguageChange={(language, autoDetect) => {
                      const updated = { ...settings, language, autoDetectLanguage: autoDetect };
                      setSettings(updated);
                      if (window.electronAPI) {
                        window.electronAPI.setStoreValue('settings', updated);
                      }
                    }}
                  />

                  <button
                    className="btn-primary sidebar-action-btn"
                    onClick={handleGenerate}
                    disabled={!canGenerate}
                  >
                    <span className="icon icon-sm">auto_awesome</span> Generate Subtitles
                  </button>

                  <div className="sidebar-divider">
                    <span>or</span>
                  </div>

                  <button
                    className="btn-secondary sidebar-action-btn"
                    onClick={handleLoadSubtitles}
                  >
                    <span className="icon icon-sm">upload_file</span> Import Subtitles
                  </button>
                  <p className="sidebar-hint">
                    Supported formats: .srt, .vtt, .ass
                  </p>
                </div>
              )}

              {subtitles.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <label className="sidebar-label">Export Format</label>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch' }}>
                    <CustomSelect
                      options={[
                        { value: 'srt', label: 'SRT' },
                        { value: 'vtt', label: 'VTT' },
                        { value: 'ass', label: 'ASS' },
                      ]}
                      value={exportFormat}
                      onChange={(v) => setExportFormat(v as 'srt' | 'vtt' | 'ass')}
                      style={{ width: '100px' }}
                    />
                    <button
                      className="btn-primary download-btn"
                      onClick={handleDownload}
                      style={{ flex: 1, justifyContent: 'center' }}
                    >
                      <span className="icon icon-sm">download</span> Download
                    </button>
                  </div>
                </div>
              )}

              <ProgressIndicator
                state={processing}
                providerLabel={PROVIDER_LABELS[settings.activeProvider]}
                onRetry={handleGenerate}
                onDismiss={() => setProcessing({ status: 'idle', progress: 0 })}
              />
            </div>

            <div className="editor-main">
              {subtitles.length > 0 && (
                <div className="view-toggle-bar">
                  <button
                    className={`view-toggle-btn${editorView === 'subtitles' ? ' active' : ''}`}
                    onClick={() => setEditorView('subtitles')}
                  >
                    <span className="icon icon-sm">list</span> Subtitles
                  </button>
                  <button
                    className={`view-toggle-btn${editorView === 'preview' ? ' active' : ''}`}
                    onClick={() => setEditorView('preview')}
                  >
                    <span className="icon icon-sm">visibility</span> Preview
                  </button>
                </div>
              )}

              {editorView === 'subtitles' ? (
                <SubtitleEditor
                  subtitles={subtitles}
                  onSubtitlesChange={setSubtitles}
                  currentTime={currentTime}
                  onSeek={handleSeek}
                  mediaDuration={mediaFile?.duration}
                />
              ) : (
                mediaFile && (
                  <SubtitlePreview
                    subtitles={subtitles}
                    currentTime={currentTime}
                    mediaFile={mediaFile}
                    audioPath={audioPath}
                  />
                )
              )}
            </div>
          </div>
        )}
      </main>

      {
        audioPath && (
          <footer className="app-footer">
            {mediaFile?.name && (
              <div className="player-track-info">
                <div className="player-track-name">{mediaFile.name}</div>
              </div>
            )}
            {subtitles.length > 0 && (
              <TimelinePreview
                subtitles={subtitles}
                duration={duration}
                currentTime={currentTime}
                onSeek={handleSeek}
                mediaDuration={mediaFile?.duration}
              />
            )}
            <div className="footer-bottom-row">
              <AudioPlayer
                audioPath={audioPath}
                currentTime={currentTime}
                duration={duration}
                onTimeUpdate={setCurrentTime}
                onDurationChange={setDuration}
                mediaDuration={mediaFile?.duration}
              />
              <TokenUsageDisplay stats={tokenStats} />
            </div>
          </footer>
        )
      }

      {
        showSettings && (
          <Settings
            settings={settings}
            onSettingsChange={handleSettingsChange}
            onClose={() => setShowSettings(false)}
          />
        )
      }

      {
        showShortcuts && (
          <ShortcutsModal onClose={() => setShowShortcuts(false)} />
        )
      }
    </div >
  );
}

export default App;
