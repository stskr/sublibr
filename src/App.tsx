import { useState, useEffect, useCallback, useRef } from 'react';
import { Settings } from './components/Settings';
import { FileUpload } from './components/FileUpload';
import { SubtitleEditor } from './components/SubtitleEditor';
import { ShortcutsModal } from './components/ShortcutsModal';
import { AudioPlayer } from './components/AudioPlayer';
import type { AudioPlayerHandle } from './components/AudioPlayer';
import { SubtitlePreview } from './components/SubtitlePreview';
import { Timeline } from './components/Timeline/Timeline';
import { ProgressIndicator } from './components/ProgressIndicator';
import { LanguageSelector } from './components/LanguageSelector';
import { CustomSelect } from './components/CustomSelect';
import { createAudioChunks } from './services/audioProcessor';
import { transcribeChunk, mergeSubtitles, enforceSubtitleQuality, generateSrt, generateWebVtt, generateAss, translateSubtitles } from './services/transcriber';
import { healSubtitles } from './services/healer';
import { parseSubtitleFile } from './services/subtitleParser';
import { useUndoRedo } from './hooks/useUndoRedo';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { generateId, formatDisplayTime, isVideoFile, isSupportedFile, formatFileSize } from './utils';
import type { Subtitle, MediaFile, AppSettings, ProcessingState, RecentFile, TokenUsage, SessionTokenStats, SubtitleVersion } from './types';
import { PROVIDER_LABELS, MODEL_OPTIONS } from './services/providers';
import { TokenUsageDisplay } from './components/TokenUsageDisplay';
import { UpdateNotification } from './components/UpdateNotification';

import './App.css';

import logoWhite from './assets/Logo/logo-white.svg';

const DEFAULT_SETTINGS: AppSettings = {
  activeProvider: 'gemini',
  providers: {
    gemini: { enabled: true, apiKey: '', model: 'gemini-2.5-flash' },
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
  // Versions state
  const [versions, setVersions] = useState<SubtitleVersion[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [showGenerator, setShowGenerator] = useState(false);
  const [showTranslator, setShowTranslator] = useState(false);
  const [translateTargetLang, setTranslateTargetLang] = useState('Spanish');
  const [highlightedRecentIndex, setHighlightedRecentIndex] = useState<number | null>(null);
  const [activeTool, setActiveTool] = useState<'select' | 'scissors' | 'trim'>('select');

  console.log('[App Render] canUndo:', canUndo, 'canRedo:', canRedo, 'history length:', subtitles.length);

  const audioPlayerRef = useRef<AudioPlayerHandle>(null);

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

  // Persist versions when they change
  useEffect(() => {
    if (!mediaFile || !window.electronAPI) return;

    // Debounce slightly to avoid rapid writes if state updates quickly
    const timeout = setTimeout(async () => {
      try {
        const cache = (await window.electronAPI.getStoreValue('subtitle-versions') || {}) as Record<string, SubtitleVersion[]>;
        cache[mediaFile.path] = versions;
        await window.electronAPI.setStoreValue('subtitle-versions', cache);
      } catch (error) {
        console.error('Failed to save versions:', error);
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [versions, mediaFile]);



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
      setAudioPath(mediaFile.path); // Play original file directly

      // Restore cached subtitles if available
      const cache = (await window.electronAPI.getStoreValue('subtitle-cache') || {}) as Record<string, Subtitle[]>;
      const cached = cache[recent.path];

      let hasSubtitles = false;
      if (cached?.length) {
        resetSubtitles(cached);
        hasSubtitles = true;
      } else {
        resetSubtitles([]);
      }

      // Restore versions
      const versionCache = (await window.electronAPI.getStoreValue('subtitle-versions') || {}) as Record<string, SubtitleVersion[]>;
      const cachedVersions = versionCache[recent.path];

      setVersions(cachedVersions || []);

      // Set active version to the last (most recent) version
      if (cachedVersions?.length) {
        const latestVersion = cachedVersions[cachedVersions.length - 1];
        setActiveVersionId(latestVersion.id);
        // If no subtitle-cache, fall back to the version's subtitles
        if (!hasSubtitles) {
          resetSubtitles(latestVersion.subtitles);
          hasSubtitles = true;
        }
      } else {
        setActiveVersionId(null);
      }

      // If we have subtitles, show the editor/download view. Otherwise show generator.
      setShowGenerator(!hasSubtitles);
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
      await window.electronAPI.deleteStoreValue('subtitle-versions');
    }
    // Update recents to remove subtitleCount indicators
    setRecentFiles(prev => {
      const updated = prev.map(f => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const processFile = useCallback(async (filePath: string) => {
    setIsAnalyzing(true);
    setProcessingError(null);

    try {
      if (!window.electronAPI) {
        throw new Error('File upload requires Electron. Please run the app in Electron.');
      }

      // Quick extension check before calling API
      const ext = filePath.split('.').pop();
      if (ext && !isSupportedFile(`.${ext}`)) {
        throw new Error(`Unsupported file type: .${ext}. Please use a supported audio or video file.`);
      }

      const info = await window.electronAPI.getFileInfo(filePath);

      // Validate size (3GB)
      if (info.size > 3 * 1024 * 1024 * 1024) {
        throw new Error(`File too large. Maximum size is 3GB. Your file: ${formatFileSize(info.size)}`);
      }

      // Get duration
      const duration = await window.electronAPI.getDuration(filePath);

      const file: MediaFile = {
        path: info.path,
        name: info.name,
        ext: info.ext,
        size: info.size,
        duration,
        isVideo: isVideoFile(info.ext),
      };

      setMediaFile(file);
      resetSubtitles([]);
      setDuration(file.duration);
      setAudioPath(file.path);

      // Try to load existing versions
      try {
        const store = await window.electronAPI.getStoreValue('subtitle-versions') as Record<string, SubtitleVersion[]>;
        const existing = store?.[file.path];

        if (existing && existing.length > 0) {
          setVersions(existing);
          const latestVersion = existing[existing.length - 1];
          setActiveVersionId(latestVersion.id);
          setSubtitles(latestVersion.subtitles);
          setShowGenerator(false);
        } else {
          setVersions([]);
          setActiveVersionId(null);
          setShowGenerator(true);
        }
      } catch (err) {
        console.error('Failed to load version history:', err);
      }

      addToRecents(file, 'opened');
    } catch (err) {
      setProcessingError(err instanceof Error ? err.message : 'Failed to process file');
    } finally {
      setIsAnalyzing(false);
    }
  }, [addToRecents, resetSubtitles, setSubtitles]);

  const handleFileSelect = useCallback(async (file: MediaFile) => {
    // This is now called from RecentFiles or drag-and-drop if we keep it simple
    // but processFile handles most logic now.
    setMediaFile(file);
    resetSubtitles([]);
    setDuration(file.duration);
    setAudioPath(file.path);

    // Try to load existing versions
    if (window.electronAPI) {
      try {
        const store = await window.electronAPI.getStoreValue('subtitle-versions') as Record<string, SubtitleVersion[]>;
        const existing = store?.[file.path];

        if (existing && existing.length > 0) {
          setVersions(existing);
          // Auto-select the latest version
          const latestVersion = existing[existing.length - 1];
          setActiveVersionId(latestVersion.id);
          setSubtitles(latestVersion.subtitles);
          setShowGenerator(false);
        } else {
          setVersions([]);
          setActiveVersionId(null);
          setShowGenerator(true);
        }
      } catch (err) {
        console.error('Failed to load version history:', err);
      }
    }

    addToRecents(file, 'opened');
  }, [addToRecents, resetSubtitles, setSubtitles]);

  // Generate subtitles
  const handleGenerate = useCallback(async () => {
    const activeConfig = settings.providers[settings.activeProvider];
    if (!mediaFile || !activeConfig.apiKey) {
      if (!activeConfig.apiKey) {
        setShowSettings(true);
      }
      return;
    }

    const { apiKey, model } = activeConfig;
    const provider = settings.activeProvider;

    try {
      const tempDir = await window.electronAPI.getTempPath();

      // Step 0: Extract audio from video if needed
      // Determine format based on provider
      const audioFormat = provider === 'openai' ? 'mp3' : 'flac';

      let processAudioPath = mediaFile.path;
      if (mediaFile.isVideo) {
        setProcessing({ status: 'extracting', progress: 5 });
        const audioOutput = `${tempDir}/subtitles_gen_audio_${Date.now()}.${audioFormat}`;
        await window.electronAPI.extractAudio(mediaFile.path, audioOutput, audioFormat);
        processAudioPath = audioOutput;
      }

      // Step 1: Detect silences and split into chunks
      setProcessing({ status: 'detecting-silences', progress: 15 });
      const { chunks, silences } = await createAudioChunks(processAudioPath, tempDir, audioFormat);

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
          processAudioPath,
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

      const versionId = generateId();
      const newVersion: SubtitleVersion = {
        id: versionId,
        timestamp: Date.now(),
        provider: settings.activeProvider,
        model: activeConfig.model,
        language: settings.language,
        subtitles: merged,
        label: `${settings.autoDetectLanguage ? 'Auto-Detect' : settings.language} (${activeConfig.model})`,
      };

      setVersions(prev => {
        const updated = [...prev, newVersion];
        // Persist versions
        if (window.electronAPI) {
          window.electronAPI.getStoreValue('subtitle-versions').then((store) => {
            const versionCache = (store || {}) as Record<string, SubtitleVersion[]>;
            versionCache[mediaFile.path] = updated;
            window.electronAPI.setStoreValue('subtitle-versions', versionCache);
          });
        }
        return updated;
      });
      setActiveVersionId(versionId);
      setSubtitles(merged);
      setProcessing({ status: 'done', progress: 100 });
      setShowGenerator(false);

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
  }, [mediaFile, settings, addTokenUsage, addToRecents, setSubtitles]);

  // Helper to persist versions
  const persistVersions = useCallback((newVersions: SubtitleVersion[]) => {
    if (mediaFile && window.electronAPI) {
      window.electronAPI.getStoreValue('subtitle-versions').then((store) => {
        const versionCache = (store || {}) as Record<string, SubtitleVersion[]>;
        versionCache[mediaFile.path] = newVersions;
        window.electronAPI.setStoreValue('subtitle-versions', versionCache);
      });
    }
  }, [mediaFile]);

  // Handle Regenerate Click
  const handleRegenerate = useCallback(() => {
    let updatedVersions = versions;

    // If we have subtitles but no version history (e.g. restored from cache or legacy),
    // create a snapshot version so we don't lose the current state.
    if (versions.length === 0 && subtitles.length > 0) {
      const restoredVersion: SubtitleVersion = {
        id: generateId(),
        timestamp: Date.now(),
        provider: settings.activeProvider,
        model: settings.providers[settings.activeProvider].model,
        language: settings.language,
        subtitles: subtitles,
        label: `Restored Version (${settings.language}, ${settings.providers[settings.activeProvider].model})`,
      };
      updatedVersions = [restoredVersion];
      setVersions(updatedVersions);
      persistVersions(updatedVersions);
    } else if (activeVersionId) {
      // Save current work to active version before switching mode
      updatedVersions = versions.map(v => v.id === activeVersionId ? { ...v, subtitles } : v);
      setVersions(updatedVersions);
      persistVersions(updatedVersions);
    }
    setShowGenerator(true);
  }, [activeVersionId, subtitles, versions, settings, persistVersions]);

  // Handle Translate Click
  const handleTranslate = useCallback(async () => {
    const activeConfig = settings.providers[settings.activeProvider];
    if (!activeConfig.apiKey) {
      setShowSettings(true);
      return;
    }

    setProcessing({ status: 'transcribing', progress: 0 });

    try {
      const result = await translateSubtitles(
        subtitles,
        translateTargetLang,
        settings.activeProvider,
        activeConfig.apiKey,
        activeConfig.model,
        (progress) => setProcessing({ status: 'transcribing', progress })
      );

      addTokenUsage(result.tokenUsage);

      const versionId = generateId();
      const newVersion: SubtitleVersion = {
        id: versionId,
        timestamp: Date.now(),
        provider: settings.activeProvider,
        model: activeConfig.model,
        language: translateTargetLang,
        subtitles: result.subtitles,
        label: `Translated to ${translateTargetLang} (${activeConfig.model})`,
      };

      setVersions(prev => {
        const updated = [...prev, newVersion];
        persistVersions(updated);
        return updated;
      });
      setActiveVersionId(versionId);
      setSubtitles(result.subtitles);
      setProcessing({ status: 'done', progress: 100 });
      setShowTranslator(false);

      if (mediaFile) {
        addToRecents(mediaFile, 'generated', result.subtitles.length);
        if (window.electronAPI) {
          const cache = (await window.electronAPI.getStoreValue('subtitle-cache') || {}) as Record<string, Subtitle[]>;
          cache[mediaFile.path] = result.subtitles;
          window.electronAPI.setStoreValue('subtitle-cache', cache).catch(() => { });
        }
      }

      setTimeout(() => {
        setProcessing({ status: 'idle', progress: 0 });
      }, DONE_STATUS_DELAY_MS);

    } catch (error) {
      setProcessing({
        status: 'error',
        progress: 0,
        error: error instanceof Error ? error.message : 'Translation failed',
      });
    }
  }, [subtitles, translateTargetLang, settings, mediaFile, addTokenUsage, addToRecents, setSubtitles, persistVersions]);


  // Handle Version Switching
  const handleVersionSelect = useCallback((versionId: string) => {
    let updatedVersions = versions;

    // Save current work to active version
    if (activeVersionId) {
      updatedVersions = versions.map(v => v.id === activeVersionId ? { ...v, subtitles } : v);
      setVersions(updatedVersions);
      persistVersions(updatedVersions);
    }

    const targetVersion = updatedVersions.find(v => v.id === versionId);
    if (targetVersion) {
      setActiveVersionId(versionId);
      resetSubtitles(targetVersion.subtitles);
      setShowGenerator(false);
    }
  }, [activeVersionId, subtitles, versions, resetSubtitles, persistVersions]);

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
    audioPlayerRef.current?.seek(time);
  }, []);

  // Keyboard Shortcuts Handlers
  const handleUndo = useCallback(() => {
    console.log('[App] handleUndo called. canUndo:', canUndo);
    if (canUndo) undoSubtitles();
  }, [canUndo, undoSubtitles]);

  const handleRedo = useCallback(() => {
    console.log('[App] handleRedo called. canRedo:', canRedo);
    if (canRedo) redoSubtitles();
  }, [canRedo, redoSubtitles]);

  const handlePlayPause = useCallback(() => {
    audioPlayerRef.current?.togglePlay();
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

  const handleNavigateRecentUp = useCallback(() => {
    if (mediaFile || !recentFiles.length) return;
    setHighlightedRecentIndex(prev => {
      if (prev === null) return recentFiles.length - 1;
      return (prev - 1 + recentFiles.length) % recentFiles.length;
    });
  }, [mediaFile, recentFiles.length]);

  const handleNavigateRecentDown = useCallback(() => {
    if (mediaFile || !recentFiles.length) return;
    setHighlightedRecentIndex(prev => {
      if (prev === null) return 0;
      return (prev + 1) % recentFiles.length;
    });
  }, [mediaFile, recentFiles.length]);

  const handleSelectRecent = useCallback(() => {
    if (mediaFile || highlightedRecentIndex === null || !recentFiles[highlightedRecentIndex]) return;
    handleLoadRecent(recentFiles[highlightedRecentIndex]);
  }, [mediaFile, highlightedRecentIndex, recentFiles, handleLoadRecent]);

  const handleOpenFileShortcut = useCallback(async () => {
    if (mediaFile) return;
    if (!window.electronAPI) return;
    const filePath = await window.electronAPI.openFileDialog();
    if (filePath) {
      processFile(filePath);
    }
  }, [mediaFile, processFile]);

  const handleSubtitleLineChange = useCallback((id: string, text: string) => {
    setSubtitles(subtitles.map(s => s.id === id ? { ...s, text } : s));
  }, [subtitles, setSubtitles]);

  const handleSplitSubtitle = useCallback((id: string, splitTime: number) => {
    const sub = subtitles.find(s => s.id === id);
    if (!sub) return;

    const newSub: Subtitle = {
      id: generateId(),
      index: 0, // Will be re-indexed
      startTime: splitTime,
      endTime: sub.endTime,
      text: sub.text // Copy text initially
    };

    const updatedSub = { ...sub, endTime: splitTime };
    const subIndex = subtitles.findIndex(s => s.id === id);

    const newSubtitles = [...subtitles];
    newSubtitles[subIndex] = updatedSub;
    newSubtitles.splice(subIndex + 1, 0, newSub);

    const reindexed = newSubtitles.map((s, i) => ({ ...s, index: i + 1 }));
    setSubtitles(reindexed);
  }, [subtitles, setSubtitles]);

  const handleTrimSubtitle = useCallback((id: string, startTime: number, endTime: number) => {
    setSubtitles(subtitles.map(s =>
      s.id === id ? { ...s, startTime, endTime } : s
    ));
  }, [subtitles, setSubtitles]);

  const handleEscape = useCallback(() => {
    // 1. Reset tool to select
    setActiveTool('select');

    // 2. Close modals if open
    setShowSettings(false);
    setShowShortcuts(false);
    setShowGenerator(false);
    setShowTranslator(false);

    // 3. Clear recent files highlight
    setHighlightedRecentIndex(null);
  }, []);

  useKeyboardShortcuts({
    onUndo: handleUndo,
    onRedo: handleRedo,
    onSave: handleDownload, // Shortcut for saving/downloading
    onPlayPause: handlePlayPause,
    onSeekBackward: handleSeekBackward,
    onSeekForward: handleSeekForward,
    onInsertSubtitle: handleInsertSubtitle,
    onDeleteSubtitle: handleDeleteSubtitle,
    onOpenFile: handleOpenFileShortcut,
    onNavigateRecentUp: handleNavigateRecentUp,
    onNavigateRecentDown: handleNavigateRecentDown,
    onSelectRecent: handleSelectRecent,
    onSelectTool: setActiveTool,
    onEscape: handleEscape
  });

  const activeConfig = settings.providers[settings.activeProvider];
  const canGenerate = mediaFile && activeConfig.enabled && activeConfig.apiKey && processing.status === 'idle';
  const isProcessing = processing.status !== 'idle' && processing.status !== 'done' && processing.status !== 'error';

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          {mediaFile && (
            <button
              className="btn-icon"
              onClick={() => {
                setMediaFile(null);
                setAudioPath(null);
                resetSubtitles([]);
                setVersions([]);
                setActiveVersionId(null);
                setShowGenerator(true);
                setShowTranslator(false);
                setCurrentTime(0);
                setDuration(0);
                setProcessing({ status: 'idle', progress: 0 });
              }}
              title="Back to Home"
              aria-label="Back to Home"
            >
              <span className="icon">home</span>
            </button>
          )}
        </div>

        <div className="header-right">
          <button className="btn-icon" onClick={() => setShowShortcuts(true)} title="Keyboard Shortcuts" aria-label="Keyboard Shortcuts">
            <span className="icon">keyboard</span>
          </button>
          <button className="btn-icon" onClick={() => setShowSettings(true)} title="Settings" aria-label="Settings">
            <span className="icon">settings</span>
          </button>
        </div>
      </header>

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
            highlightedRecentIndex={highlightedRecentIndex}
            onProcessFile={processFile}
            isAnalyzing={isAnalyzing}
            error={processingError}
          />
        ) : (
          <div className="editor-container">
            <div className="editor-sidebar">
              <div className="sidebar-brand-row">
                <div className="sidebar-brand">
                  <img src={logoWhite} alt="SUBLIBR Logo" style={{ height: '16px' }} />
                  <span className="sidebar-brand-name">SUBLIBR</span>
                </div>
              </div>

              {!isProcessing && (showGenerator || subtitles.length === 0) && !showTranslator && (
                <div className="sidebar-section">
                  {versions.length > 0 && (
                    <button
                      className="btn-secondary sidebar-action-btn"
                      onClick={() => setShowGenerator(false)}
                    >
                      <span className="icon icon-sm">chevron_left</span>
                      Cancel
                    </button>
                  )}

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

              {!isProcessing && showTranslator && (
                <div className="sidebar-section">
                  <button
                    className="btn-secondary sidebar-action-btn"
                    onClick={() => setShowTranslator(false)}
                  >
                    <span className="icon icon-sm">chevron_left</span>
                    Cancel
                  </button>

                  <LanguageSelector
                    language={translateTargetLang}
                    autoDetect={false}
                    onLanguageChange={(language) => setTranslateTargetLang(language)}
                    mode="translation"
                  />

                  <button
                    className="btn-primary sidebar-action-btn"
                    onClick={handleTranslate}
                  >
                    <span className="icon icon-sm">translate</span> Start Translation
                  </button>
                </div>
              )}

              {!isProcessing && !showGenerator && !showTranslator && subtitles.length > 0 && (
                <div className="sidebar-section">
                  {/* Version Selector */}
                  {versions.length > 0 && (
                    <div style={{ marginBottom: '1rem' }}>
                      <label className="sidebar-label">Versions</label>
                      <CustomSelect
                        options={versions.map((v, i) => ({
                          value: v.id,
                          label: v.label || `Version ${i + 1} (${v.model})`
                        }))}
                        value={activeVersionId || ''}
                        onChange={handleVersionSelect}
                      />
                    </div>
                  )}

                  <button
                    className="btn-secondary sidebar-action-btn"
                    onClick={() => setShowTranslator(true)}
                    style={{ marginBottom: '0.5rem', width: '100%' }}
                  >
                    <span className="icon icon-sm">translate</span> Translate
                  </button>
                  <button
                    className="btn-secondary sidebar-action-btn"
                    onClick={handleRegenerate}
                    style={{ marginBottom: '1.5rem', width: '100%' }}
                  >
                    <span className="icon icon-sm">refresh</span> Regenerate
                  </button>

                  <div className="sidebar-divider"></div>
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

              {editorView === 'subtitles' ? (
                <SubtitleEditor
                  subtitles={subtitles}
                  onSubtitlesChange={setSubtitles}
                  currentTime={currentTime}
                  onSeek={handleSeek}
                  mediaDuration={mediaFile?.duration}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  canUndo={canUndo}
                  canRedo={canRedo}
                />
              ) : (
                mediaFile && (
                  <SubtitlePreview
                    subtitles={subtitles}
                    currentTime={currentTime}
                    mediaFile={mediaFile}
                    onSubtitleChange={handleSubtitleLineChange}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    canUndo={canUndo}
                    canRedo={canRedo}
                  />
                )
              )}
            </div>
          </div>
        )
        }
      </main >

      {
        audioPath && (
          <footer className="app-footer">
            <Timeline
              subtitles={subtitles}
              duration={duration}
              currentTime={currentTime}
              onSeek={handleSeek}
              mediaDuration={mediaFile?.duration}
              onSplitSubtitle={handleSplitSubtitle}
              onTrimSubtitle={handleTrimSubtitle}
              activeTool={activeTool}
            />

            <div className="footer-bottom-row">
              <AudioPlayer
                ref={audioPlayerRef}
                audioPath={audioPath}
                filename={mediaFile?.name}
                currentTime={currentTime}
                duration={duration}
                onTimeUpdate={setCurrentTime}
                onDurationChange={(d) => {
                  // Only update duration if we don't have a valid one from ffprobe
                  if (!mediaFile?.duration && d > 0 && d !== Infinity) {
                    setDuration(d);
                  }
                }}
                mediaDuration={mediaFile?.duration}
              />
              <div className="footer-info-row">
                <div className="footer-left-group">
                  <button className="active-model-badge" onClick={() => setShowSettings(true)} title="Click to change model">
                    <span className="icon icon-sm">smart_toy</span>
                    <span className="active-model-label">Model in use:</span>
                    <span>{PROVIDER_LABELS[settings.activeProvider]}</span>
                    <span className="active-model-name">
                      {MODEL_OPTIONS[settings.activeProvider]?.find(m => m.value === activeConfig.model)?.label ?? activeConfig.model}
                    </span>
                  </button>
                  <TokenUsageDisplay stats={tokenStats} />
                </div>

                <div className="footer-toolbox">
                  <button
                    className={`btn-tool ${activeTool === 'select' ? 'active' : ''}`}
                    onClick={() => setActiveTool('select')}
                    title="Select Tool (V)"
                  >
                    <span className="icon">near_me</span>
                  </button>
                  <button
                    className={`btn-tool ${activeTool === 'scissors' ? 'active' : ''}`}
                    onClick={() => setActiveTool('scissors')}
                    title="Scissors Tool (C)"
                  >
                    <span className="icon">content_cut</span>
                  </button>
                  <button
                    className={`btn-tool ${activeTool === 'trim' ? 'active' : ''}`}
                    onClick={() => setActiveTool('trim')}
                    title="Trim Tool (T)"
                  >
                    <span className="icon">straighten</span>
                  </button>
                </div>
              </div>
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
          <ShortcutsModal
            onClose={() => setShowShortcuts(false)}
            view={mediaFile ? 'editor' : 'homepage'}
          />
        )
      }
    </div >
  );
}

export default App;
