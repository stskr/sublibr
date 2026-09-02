import { useState, useEffect, useCallback, useRef } from 'react';
import { Settings, type SettingsTab } from './components/Settings';
import { FileUpload } from './components/FileUpload';
import { SubtitleEditor } from './components/SubtitleEditor';
import { ShortcutsModal } from './components/ShortcutsModal';
import { AboutModal } from './components/AboutModal';
import { ProjectsFolderSetup } from './components/ProjectsFolderSetup';
import { AudioPlayer } from './components/AudioPlayer';
import type { AudioPlayerHandle } from './components/AudioPlayer';
import { SubtitlePreview } from './components/SubtitlePreview';
import { Timeline } from './components/Timeline/Timeline';
import { ProgressIndicator } from './components/ProgressIndicator';
import { LanguageSelector } from './components/LanguageSelector';
import { CustomSelect } from './components/CustomSelect';
import { TokenUsageDisplay } from './components/TokenUsageDisplay';
import { UpdateNotification } from './components/UpdateNotification';

import { useUndoRedo } from './hooks/useUndoRedo';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useMediaManager } from './hooks/useMediaManager';
import { useVersionHistory } from './hooks/useVersionHistory';
import { useTranscriptionPipeline } from './hooks/useTranscriptionPipeline';

import { generateId } from './utils';
import type { Subtitle, AppSettings, ProjectSummary, ScreenSize } from './types';
import { layoutSubtitles, reflowSubtitles } from './services/subtitleLayout';
import { parseSubtitleFile } from './services/subtitleParser';
import { DEFAULT_SUBTITLE_STYLE } from './types';
import { PROVIDER_LABELS, resolveSavedModel, resolveSavedTranslatorModel, TRANSLATOR_MODEL_OPTIONS, isTranscriptionReady, CLOUD_PROVIDERS, transcriptionModelLabel, testApiKey } from './services/providers';
import { SubtitleStylePanel } from './components/SubtitleStylePanel';
import { ResolutionPicker } from './components/ResolutionPicker';

import './App.css';
import { bindSessionLog, describeClickTarget, logSession } from './services/sessionLog';
import { settingsSnapshot } from './services/sessionSanitize';
import logoFull from './assets/Logo/logo-full-white.svg';

const DEFAULT_SETTINGS: AppSettings = {
  activeProvider: 'gemini',
  translator: { provider: 'gemini', model: 'gemini-3.6-flash' },
  providers: {
    gemini: { enabled: true, apiKey: '', model: 'gemini-3.5-transcribe' },
    openai: { enabled: false, apiKey: '', model: 'whisper-1' },
    local: { enabled: false, apiKey: '', model: 'whisper-large-v3-turbo' },
  },
  language: 'English',
  autoDetectLanguage: false,
  screenSize: 'wide',
  subtitleStyle: DEFAULT_SUBTITLE_STYLE,
  unloadAfterMinutes: 5,
  projectsFolder: '',
  projectsFolderSet: false,
};

const DEFAULT_SUBTITLE_DURATION = 2; // seconds

function App() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [folderSetup, setFolderSetup] = useState<'loading' | 'needed' | 'done'>('loading');
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general');
  const [localWhisperOk, setLocalWhisperOk] = useState<boolean | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showStylePanel, setShowStylePanel] = useState(false);

  const [subtitles, setSubtitles, undoSubtitles, redoSubtitles, canUndo, canRedo, resetSubtitles] = useUndoRedo<Subtitle[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [editorView, setEditorView] = useState<'subtitles' | 'preview'>('subtitles');
  const [activeTool, setActiveTool] = useState<'select' | 'scissors' | 'trim'>('select');
  const audioPlayerRef = useRef<AudioPlayerHandle>(null);

  useEffect(() => {
    async function loadSettings() {
      if (!window.electronAPI) {
        setFolderSetup('done');
        return;
      }
      try {
        let suggestedFolder = '';
        try {
          suggestedFolder = await window.electronAPI.getDefaultProjectsFolder();
        } catch {
          suggestedFolder = '';
        }
        const saved = await window.electronAPI.getStoreValue('settings') as Record<string, unknown> | null;
      if (saved) {
        if ('apiKey' in saved && !('providers' in saved)) {
          const chosenFolder = typeof saved.projectsFolder === 'string' ? saved.projectsFolder.trim() : '';
          const folderSet = Boolean((saved as { projectsFolderSet?: unknown }).projectsFolderSet);
          const migrated: AppSettings = {
            ...DEFAULT_SETTINGS,
            providers: {
              ...DEFAULT_SETTINGS.providers,
              gemini: {
                ...DEFAULT_SETTINGS.providers.gemini,
                enabled: true,
                apiKey: (saved.apiKey as string) || '',
                model: resolveSavedModel('gemini', (saved.model as string) || 'gemini-3.5-transcribe'),
              },
            },
            language: (saved.language as string) || 'English',
            autoDetectLanguage: (saved.autoDetectLanguage as boolean) ?? false,
            screenSize: (saved.screenSize as ScreenSize) || 'wide',
            projectsFolder: chosenFolder || suggestedFolder,
            projectsFolderSet: folderSet,
          };
          setSettings(migrated);
          await window.electronAPI.setStoreValue('settings', {
            ...migrated,
            ...(folderSet ? {} : { projectsFolder: chosenFolder, projectsFolderSet: false }),
          });
          setFolderSetup(folderSet ? 'done' : 'needed');
        } else {
          const savedSettings = saved as Partial<AppSettings> & { settingsVersion?: number };
          const savedStyle = savedSettings.subtitleStyle as Partial<typeof DEFAULT_SETTINGS.subtitleStyle> | undefined;
          // v3 migration: force-reset positionX/Y to defaults (previous saves may have
          // captured a stale/incorrect value from before the fields were properly initialised)
          const needsPositionMigration = !savedSettings.settingsVersion || savedSettings.settingsVersion < 3;
          const mergedSubtitleStyle = {
            ...DEFAULT_SETTINGS.subtitleStyle,
            ...savedStyle,
            ...(needsPositionMigration ? {
              positionX: DEFAULT_SETTINGS.subtitleStyle.positionX,
              positionY: DEFAULT_SETTINGS.subtitleStyle.positionY,
            } : {}),
          };
          // Deep-merge providers so new ProviderConfig fields get their
          // defaults even when loading settings saved before those fields existed.
          const mergedProviders = {
            ...DEFAULT_SETTINGS.providers,
            ...savedSettings.providers,
            gemini: { ...DEFAULT_SETTINGS.providers.gemini, ...savedSettings.providers?.gemini },
            openai: { ...DEFAULT_SETTINGS.providers.openai, ...savedSettings.providers?.openai },
            local: { ...DEFAULT_SETTINGS.providers.local, ...savedSettings.providers?.local },
          };
          mergedProviders.gemini.model = resolveSavedModel('gemini', mergedProviders.gemini.model);
          mergedProviders.openai.model = resolveSavedModel('openai', mergedProviders.openai.model);
          mergedProviders.local.model = resolveSavedModel('local', mergedProviders.local.model);
          let translatorProvider = savedSettings.translator?.provider ?? DEFAULT_SETTINGS.translator.provider;
          const translatorUsable = (p: typeof translatorProvider) => {
            if (TRANSLATOR_MODEL_OPTIONS[p]?.length === 0) return false;
            if (p === 'local') return true;
            return Boolean(mergedProviders[p]?.apiKey?.trim());
          };
          if (!translatorUsable(translatorProvider)) {
            translatorProvider = (['local', ...CLOUD_PROVIDERS] as const).find(translatorUsable) ?? 'gemini';
          }
          const translatorModel = resolveSavedTranslatorModel(
            translatorProvider,
            savedSettings.translator?.model ?? TRANSLATOR_MODEL_OPTIONS[translatorProvider][0].value,
          );
          const chosenFolder = savedSettings.projectsFolder?.trim() || '';
          const folderSet = Boolean(savedSettings.projectsFolderSet);
          const merged: AppSettings = {
            ...DEFAULT_SETTINGS,
            ...savedSettings,
            providers: mergedProviders,
            translator: { provider: translatorProvider, model: translatorModel },
            subtitleStyle: mergedSubtitleStyle,
            projectsFolder: chosenFolder || suggestedFolder,
            projectsFolderSet: folderSet,
          };
          setSettings(merged);
          if (needsPositionMigration && window.electronAPI) {
            window.electronAPI.setStoreValue('settings', {
              ...merged,
              settingsVersion: 3,
              ...(folderSet ? {} : { projectsFolderSet: false }),
            }).catch(() => {});
          }
          setFolderSetup(folderSet ? 'done' : 'needed');
        }
      } else {
        setSettings({ ...DEFAULT_SETTINGS, projectsFolder: suggestedFolder });
        setFolderSetup('needed');
      }
      } catch {
        setFolderSetup('needed');
      }
    }
    loadSettings();
  }, []);

  const handleSettingsChange = useCallback(async (newSettings: AppSettings) => {
    setSettings(newSettings);
    logSession('settings.saved', settingsSnapshot(newSettings));
    if (window.electronAPI) {
      await window.electronAPI.setStoreValue('settings', newSettings);
    }
  }, []);

  // 1. Media Manager
  const mediaManager = useMediaManager();
  const {
    mediaFile,
    currentProject,
    audioPath,
    duration,
    latestProjects,
    highlightedRecentIndex,
    processingError,
    isAnalyzing,
    analyzingMessage,
    pendingMissing,
    deleteCandidate,
    deleteStep,
    setDuration,
    setHighlightedRecentIndex,
    processFile: coreProcessFile,
    handleLoadRecent: coreLoadRecent,
    handleCreateEmpty,
    handleAddOrReplaceMedia,
    handleRelink,
    dismissMissing,
    requestDelete,
    handleDuplicate,
    renameTarget,
    requestRename,
    cancelRename,
    submitRename,
    cancelDelete,
    confirmDelete,
    handleNavigateRecentUp,
    handleNavigateRecentDown,
    clearMedia,
    refreshProjects,
  } = mediaManager;

  // 2. Version History
  const versionHistory = useVersionHistory({
    projectDir: currentProject?.dir ?? null,
    projectName: currentProject?.name ?? 'Untitled Project',
    subtitles,
    resetSubtitles,
    settings
  });
  const {
    versions,
    setVersions,
    activeVersionId,
    setActiveVersionId,
    showGenerator,
    setShowGenerator,
    addVersion,
    handleRegenerate,
    handleVersionSelect,
  } = versionHistory;

  // Wrapped Media Manager Handlers to Sync Version History & Subtitles
  const applyOpened = useCallback(async (data: Awaited<ReturnType<typeof coreProcessFile>>) => {
    if (!data) return;
    setVersions(data.cachedVersions);
    if (data.cachedVersions.length > 0) {
      setActiveVersionId(data.cachedVersions[data.cachedVersions.length - 1].id);
    } else {
      setActiveVersionId(null);
    }
    let subs = data.subsToLoad;
    if (data.subtitleImportPath && window.electronAPI) {
      try {
        const buffer = await window.electronAPI.readFile(data.subtitleImportPath);
        const text = new TextDecoder('utf-8').decode(new Uint8Array(buffer));
        const ext = data.subtitleImportPath.split('.').pop() || '';
        const loaded = layoutSubtitles(parseSubtitleFile(text, ext), 'original', data.file?.width, data.file?.height);
        if (loaded.length > 0) subs = loaded;
      } catch (err) {
        console.error('Failed to import dropped subtitles:', err);
      }
    }
    resetSubtitles(subs);
    setShowGenerator(!data.hasSubtitles && subs.length === 0);
    setCurrentTime(0);
  }, [setVersions, setActiveVersionId, resetSubtitles, setShowGenerator]);

  const wrappedLoadRecent = useCallback(async (project: ProjectSummary) => {
    await applyOpened(await coreLoadRecent(project));
  }, [coreLoadRecent, applyOpened]);

  const wrappedProcessFile = useCallback(async (filePath: string) => {
    await applyOpened(await coreProcessFile(filePath));
  }, [coreProcessFile, applyOpened]);

  const wrappedStartFromScratch = useCallback(async () => {
    await applyOpened(await handleCreateEmpty());
  }, [handleCreateEmpty, applyOpened]);

  const wrappedAddMedia = useCallback(async () => {
    if (!window.electronAPI) return;
    const filePath = await window.electronAPI.openFileDialog();
    if (!filePath) return;
    await applyOpened(await handleAddOrReplaceMedia(filePath));
  }, [handleAddOrReplaceMedia, applyOpened]);

  const wrappedRelink = useCallback(async () => {
    await applyOpened(await handleRelink());
  }, [handleRelink, applyOpened]);

  // 3. Transcription Pipeline
  const pipeline = useTranscriptionPipeline({
    settings,
    mediaFile,
    subtitles,
    versions,
    activeVersionId,
    setSubtitles,
    resetSubtitles,
    addVersion,
    projectDir: currentProject?.dir ?? null,
    onProjectTouched: refreshProjects,
    setShowGenerator
  });
  const {
    processing,
    setProcessing,
    showTranslator,
    setShowTranslator,
    translateTargetLang,
    setTranslateTargetLang,
    exportFormat,
    setExportFormat,
    renderResolution,
    setRenderResolution,
    tokenStats,
    handleGenerate,
    handleTranslate,
    handleLoadSubtitles,
    handleDownload,
    handleRenderVideo,
    handlePause,
    handleStop,
    handleResume,
    handleSkipHealing,
    checkpointReady,
    isPausing,
  } = pipeline;

  // Render output stays on the source frame unless the user picks another size.
  useEffect(() => {
    if (!mediaFile) return;
    setRenderResolution('original');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaFile?.path]);

  useEffect(() => {
    if (!currentProject?.dir) return;
    bindSessionLog({
      projectDir: currentProject.dir,
      sourcePath: mediaFile?.path,
      name: currentProject.name,
      media: mediaFile && {
        path: mediaFile.path,
        name: mediaFile.name,
        ext: mediaFile.ext,
        size: mediaFile.size,
        duration: mediaFile.duration,
        isVideo: mediaFile.isVideo,
        width: mediaFile.width,
        height: mediaFile.height,
      },
      settings: settingsSnapshot(settings),
    });
    logSession('project.opened', { dir: currentProject.dir, name: currentProject.name, media: mediaFile?.path });
  // Snapshot settings at open; a later settings.saved event covers changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.dir, currentProject?.name, mediaFile?.path]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      logSession('ui.click', describeClickTarget(e.target));
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target?.isContentEditable;
      if (typing && !e.metaKey && !e.ctrlKey && e.key !== 'Enter' && e.key !== 'Escape') return;
      logSession('ui.keydown', {
        key: e.key,
        meta: e.metaKey,
        ctrl: e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey,
        target: describeClickTarget(e.target),
      });
    };
    const onError = (e: ErrorEvent) => {
      logSession('ui.error', { message: e.message, filename: e.filename, line: e.lineno, col: e.colno }, 'error');
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason instanceof Error
        ? { message: e.reason.message, stack: e.reason.stack }
        : { message: String(e.reason) };
      logSession('ui.unhandledRejection', reason, 'error');
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  useEffect(() => {
    if (processing.status === 'idle') return;
    logSession('pipeline.status', {
      status: processing.status,
      progress: processing.progress,
      currentChunk: processing.currentChunk,
      totalChunks: processing.totalChunks,
      error: processing.error,
    }, processing.status === 'error' ? 'error' : 'info');
  }, [processing.status]);

  // Global Editor/Player handlers
  const handleSeek = useCallback((time: number) => {
    setCurrentTime(time);
    audioPlayerRef.current?.seek(time);
  }, []);

  const handleUndo = useCallback(() => {
    if (canUndo) undoSubtitles();
  }, [canUndo, undoSubtitles]);

  const handleRedo = useCallback(() => {
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
    const insertIndex = subtitles.findIndex(s => s.startTime > currentTime);
    let startTime = currentTime;

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

    const reindexed = newSubtitles.map((s, i) => ({ ...s, index: i + 1 }));
    setSubtitles(reindexed);
  }, [subtitles, currentTime, setSubtitles]);

  const handleDeleteSubtitle = useCallback(() => {
    const activeSub = subtitles.find(s => currentTime >= s.startTime && currentTime <= s.endTime);
    if (activeSub) {
      const filtered = subtitles.filter(s => s.id !== activeSub.id).map((s, i) => ({ ...s, index: i + 1 }));
      setSubtitles(filtered);
    }
  }, [subtitles, currentTime, setSubtitles]);

  const handleSelectRecent = useCallback(() => {
    if (currentProject || highlightedRecentIndex === null || !latestProjects[highlightedRecentIndex]) return;
    wrappedLoadRecent(latestProjects[highlightedRecentIndex]);
  }, [currentProject, highlightedRecentIndex, latestProjects, wrappedLoadRecent]);

  const handleOpenFileShortcut = useCallback(async () => {
    if (currentProject) return;
    if (!window.electronAPI) return;
    const filePath = await (window.electronAPI.openImportDialog ?? window.electronAPI.openFileDialog)();
    if (filePath) {
      wrappedProcessFile(filePath);
    }
  }, [currentProject, wrappedProcessFile]);

  const handleSubtitleLineChange = useCallback((id: string, text: string) => {
    setSubtitles(subtitles.map(s => s.id === id ? { ...s, text } : s));
  }, [subtitles, setSubtitles]);

  const handleSplitSubtitle = useCallback((id: string, splitTime: number) => {
    const sub = subtitles.find(s => s.id === id);
    if (!sub) return;

    const newSub: Subtitle = {
      id: generateId(),
      index: 0,
      startTime: splitTime,
      endTime: sub.endTime,
      text: sub.text
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
    setActiveTool('select');
    setShowSettings(false);
    setShowShortcuts(false);
    setShowGenerator(false);
    setShowTranslator(false);
    setShowStylePanel(false);
    setHighlightedRecentIndex(null);
  }, [setHighlightedRecentIndex, setShowGenerator, setShowTranslator]);

  const openSettings = useCallback((tab: SettingsTab = 'general') => {
    setSettingsTab(tab);
    setShowSettings(true);
  }, []);

  useEffect(() => {
    if (settings.activeProvider !== 'local') {
      setLocalWhisperOk(null);
      return;
    }
    if (!window.electronAPI) {
      setLocalWhisperOk(false);
      return;
    }
    let cancelled = false;
    setLocalWhisperOk(null);
    testApiKey('local', '').then((result) => {
      if (!cancelled) setLocalWhisperOk(Boolean(result.ok) && !result.error);
    }).catch(() => {
      if (!cancelled) setLocalWhisperOk(false);
    });
    return () => { cancelled = true };
  }, [settings.activeProvider, showSettings]);

  useKeyboardShortcuts({
    onUndo: handleUndo,
    onRedo: handleRedo,
    onSave: handleDownload,
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
  const isProcessing = processing.status !== 'idle' && processing.status !== 'done' && processing.status !== 'error';
  const transcribeReady = isTranscriptionReady(settings.activeProvider, activeConfig, localWhisperOk);
  const canGenerate = Boolean(mediaFile) && transcribeReady && processing.status === 'idle';
  const showGeneratePanel = !isProcessing && (showGenerator || subtitles.length === 0) && !showTranslator;

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <div className="header-brand">
            <img src={logoFull} alt="Sublibr" className="header-brand-logo" />
          </div>
        </div>

        <div className="header-right">
          {currentProject && (
            <button
              className="btn-icon"
              onClick={() => {
                clearMedia();
                resetSubtitles([]);
                setVersions([]);
                setActiveVersionId(null);
                setShowGenerator(true);
                setShowTranslator(false);
                setCurrentTime(0);
                setProcessing({ status: 'idle', progress: 0 });
              }}
              title="Back to home"
              aria-label="Back to home"
            >
              <span className="icon">home</span>
            </button>
          )}
          <button className="btn-icon" onClick={() => setShowShortcuts(true)} title="Keyboard shortcuts" aria-label="Keyboard shortcuts">
            <span className="icon">keyboard</span>
          </button>
          <button className="btn-icon" onClick={() => setShowAbout(true)} title="About Sublibr" aria-label="About Sublibr">
            <span className="icon">info</span>
          </button>
          <button className="btn-icon" onClick={() => openSettings('general')} title="Settings" aria-label="Settings">
            <span className="icon">settings</span>
          </button>
        </div>
      </header>

      <UpdateNotification />

      <main className="app-main">
        {!currentProject ? (
          <FileUpload
            latestProjects={latestProjects}
            onLoadProject={wrappedLoadRecent}
            highlightedRecentIndex={highlightedRecentIndex}
            onProcessFile={wrappedProcessFile}
            onStartFromScratch={wrappedStartFromScratch}
            onRequestDelete={requestDelete}
            onDuplicateProject={handleDuplicate}
            onRenameProject={requestRename}
            isAnalyzing={isAnalyzing}
            analyzingMessage={analyzingMessage}
            error={processingError}
          />
        ) : (
          <div className="editor-container">
            <div className="editor-sidebar">
              {!showStylePanel && !showTranslator && (
              <div className="project-media-card">
                <div className="project-media-meta">
                  <span className="icon icon-sm">folder</span>
                  <button
                    type="button"
                    className="project-title-btn"
                    title="Rename project"
                    onClick={() => currentProject && requestRename(currentProject)}
                  >
                    <span className="project-media-name">{currentProject?.name}</span>
                    <span className="icon icon-sm">edit</span>
                  </button>
                </div>
                {mediaFile ? (
                  <div className="project-media-file" title={mediaFile.path}>
                    <span className="icon icon-sm">{mediaFile.isVideo ? 'movie' : 'audio_file'}</span>
                    <span>{mediaFile.name}</span>
                    <button
                      type="button"
                      className="project-file-action"
                      title="Replace media"
                      aria-label="Replace media"
                      onClick={wrappedAddMedia}
                    >
                      <span className="icon icon-sm">swap_horiz</span>
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="sidebar-hint">Add video or audio to generate or preview subtitles.</p>
                    <button className="btn-primary sidebar-action-btn" onClick={wrappedAddMedia}>
                      <span className="icon icon-sm">upload</span>
                      Add video or audio
                    </button>
                  </>
                )}
              </div>
              )}
              {!isProcessing && showGeneratePanel && (
                <div className="sidebar-section">
                  {versions.length > 0 && (
                    <button
                      className="btn-secondary sidebar-action-btn"
                      onClick={() => setShowGenerator(false)}
                    >
                      <span className="icon icon-sm">chevron_left</span>
                      Back
                    </button>
                  )}

                  <p className="sidebar-hint" style={{ marginBottom: '1rem', marginTop: '1rem' }}>
                    Subtitles stay at most two lines. Pick a frame size later under Render resolution.
                  </p>

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

                  <TranscriptionModelButton
                    settings={settings}
                    onClick={() => openSettings('models')}
                  />

                  <button
                    className="btn-primary sidebar-action-btn"
                    onClick={handleGenerate}
                    disabled={!canGenerate}
                    title={generateBlockedReason({
                      hasMedia: Boolean(mediaFile),
                      transcribeReady,
                      local: settings.activeProvider === 'local',
                      localWhisperOk,
                    })}
                  >
                    <span className="icon icon-sm">{settings.activeProvider === 'local' ? 'computer' : 'auto_awesome'}</span>
                    Generate subtitles
                  </button>
                  {!canGenerate && (
                    <>
                      <p className="sidebar-hint" style={{ marginTop: '0.4rem' }}>
                        {generateBlockedReason({
                          hasMedia: Boolean(mediaFile),
                          transcribeReady,
                          local: settings.activeProvider === 'local',
                          localWhisperOk,
                        })}
                      </p>
                      {mediaFile && !transcribeReady && !(settings.activeProvider === 'local' && localWhisperOk === null) && (
                        <button type="button" className="text-link-btn" onClick={() => openSettings('models')}>
                          Open Models
                        </button>
                      )}
                    </>
                  )}
                  {canGenerate && settings.activeProvider === 'local' && (
                    <p className="sidebar-hint" style={{ marginTop: '0.4rem' }}>
                      Audio stays on this computer.
                    </p>
                  )}

                  <div className="sidebar-divider">
                    <span>or</span>
                  </div>

                  <button
                    className="btn-secondary sidebar-action-btn"
                    onClick={handleLoadSubtitles}
                  >
                    <span className="icon icon-sm">upload_file</span> Import subtitles
                  </button>
                  <p className="sidebar-hint">
                    SRT, VTT, or ASS
                  </p>
                </div>
              )}

              {!isProcessing && showStylePanel && subtitles.length > 0 && (
                <SubtitleStylePanel
                  style={settings.subtitleStyle}
                  onChange={(newStyle) => {
                    const updated = { ...settings, subtitleStyle: newStyle };
                    setSettings(updated);
                    if (window.electronAPI) window.electronAPI.setStoreValue('settings', updated);
                  }}
                  onBack={() => setShowStylePanel(false)}
                  screenSize={renderResolution}
                  mediaWidth={mediaFile?.width}
                  mediaHeight={mediaFile?.height}
                />
              )}

              {!isProcessing && showTranslator && (
                <div className="sidebar-section">
                  <button
                    className="btn-secondary sidebar-action-btn"
                    onClick={() => setShowTranslator(false)}
                  >
                    <span className="icon icon-sm">chevron_left</span>
                    Back
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
                    <span className="icon icon-sm">translate</span> Translate
                  </button>
                  <p className="sidebar-hint" style={{ marginTop: '0.4rem' }}>
                    Saves a new version. The original is kept.
                  </p>
                </div>
              )}

              {!isProcessing && !showGenerator && !showTranslator && !showStylePanel && subtitles.length > 0 && (
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
                    title="Create a translated copy as a new version"
                  >
                    <span className="icon icon-sm">translate</span> Translate
                  </button>
                  <button
                    className="btn-secondary sidebar-action-btn"
                    onClick={handleRegenerate}
                    style={{ marginBottom: '0.5rem', width: '100%' }}
                    title="Go back to change language or model, then transcribe again. This version is kept."
                  >
                    <span className="icon icon-sm">refresh</span> Regenerate
                  </button>
                  <button
                    className="btn-secondary sidebar-action-btn"
                    onClick={() => setShowStylePanel(true)}
                    style={{ width: '100%', marginBottom: '0.5rem' }}
                  >
                    <span className="icon icon-sm">palette</span> Style
                  </button>
                  <button
                    className="btn-secondary sidebar-action-btn"
                    onClick={() => setSubtitles(reflowSubtitles(subtitles, renderResolution, mediaFile?.width, mediaFile?.height))}
                    style={{ width: '100%' }}
                    title="Rewrap lines for the current frame size"
                  >
                    <span className="icon icon-sm">wrap_text</span> Reformat lines
                  </button>
                  <p className="sidebar-hint" style={{ marginTop: '0.4rem', marginBottom: '1.25rem' }}>
                    Shorter lines on 9:16, longer on 16:9. Changing resolution does this automatically.
                  </p>

                  <div className="sidebar-divider"></div>
                  <label className="sidebar-label">Export</label>
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
                  {mediaFile && ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.ts', '.mts', '.m2ts'].includes(mediaFile.ext) && (
                    <div style={{ marginTop: '1rem' }}>
                      <label className="sidebar-label">Render resolution</label>
                      <ResolutionPicker
                        value={renderResolution}
                        mediaWidth={mediaFile.width}
                        mediaHeight={mediaFile.height}
                        onChange={(next) => {
                          setRenderResolution(next);
                          if (subtitles.length > 0) {
                            setSubtitles(reflowSubtitles(subtitles, next, mediaFile.width, mediaFile.height));
                          }
                        }}
                      />
                      <p className="sidebar-hint" style={{ marginTop: '0.25rem' }}>
                        Preview, wrapping, and rendered video use this frame.
                      </p>
                      <button
                        className="btn-secondary sidebar-action-btn"
                        onClick={handleRenderVideo}
                        style={{ marginTop: '0.5rem', width: '100%' }}
                        title="Create a new video with subtitles burned in"
                      >
                        <span className="icon icon-sm">movie</span> Render video
                      </button>
                    </div>
                  )}
                </div>
              )}

              <ProgressIndicator
                state={processing}
                providerLabel={processing.status === 'translating'
                  ? PROVIDER_LABELS[settings.translator.provider]
                  : PROVIDER_LABELS[settings.activeProvider]}
                isLocal={processing.status === 'translating'
                  ? settings.translator.provider === 'local'
                  : settings.activeProvider === 'local'}
                onRetry={handleGenerate}
                onDismiss={() => setProcessing({ status: 'idle', progress: 0 })}
                onPause={handlePause}
                onResume={handleResume}
                onStop={handleStop}
                onSkipHealing={handleSkipHealing}
                canResume={checkpointReady}
                isPausing={isPausing}
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
                mediaFile ? (
                  <SubtitlePreview
                    subtitles={subtitles}
                    currentTime={currentTime}
                    mediaFile={mediaFile}
                    subtitleStyle={settings.subtitleStyle}
                    renderResolution={renderResolution}
                    onSubtitleChange={handleSubtitleLineChange}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    canUndo={canUndo}
                    canRedo={canRedo}
                  />
                ) : (
                  <div className="preview-empty-media">
                    <span className="icon icon-lg">movie</span>
                    <p>Add video or audio to preview subtitles.</p>
                    <button className="btn-primary" onClick={wrappedAddMedia}>Add video or audio</button>
                  </div>
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
                  if (!mediaFile?.duration && d > 0 && d !== Infinity) {
                    setDuration(d);
                  }
                }}
                mediaDuration={mediaFile?.duration}
              />
              <div className="footer-info-row">
                <div className="footer-left-group">
                  {!showGeneratePanel && (
                    <TranscriptionModelButton
                      settings={settings}
                      onClick={() => openSettings('models')}
                    />
                  )}
                  <TokenUsageDisplay stats={tokenStats} />
                </div>

                <div className="footer-toolbox">
                  <button
                    className={`btn-tool ${activeTool === 'select' ? 'active' : ''}`}
                    onClick={() => setActiveTool('select')}
                    title="Select (V)"
                  >
                    <span className="icon">near_me</span>
                  </button>
                  <button
                    className={`btn-tool ${activeTool === 'scissors' ? 'active' : ''}`}
                    onClick={() => setActiveTool('scissors')}
                    title="Split (C)"
                  >
                    <span className="icon">content_cut</span>
                  </button>
                  <button
                    className={`btn-tool ${activeTool === 'trim' ? 'active' : ''}`}
                    onClick={() => setActiveTool('trim')}
                    title="Trim (T)"
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
        folderSetup === 'needed' && (
          <ProjectsFolderSetup
            suggestedFolder={settings.projectsFolder}
            onConfirm={(folder) => {
              setSettings(prev => ({ ...prev, projectsFolder: folder, projectsFolderSet: true }));
              setFolderSetup('done');
            }}
          />
        )
      }

      {
        showSettings && folderSetup === 'done' && (
          <Settings
            settings={settings}
            onSettingsChange={handleSettingsChange}
            onClose={() => setShowSettings(false)}
            initialTab={settingsTab}
          />
        )
      }

      {
        showShortcuts && (
          <ShortcutsModal
            onClose={() => setShowShortcuts(false)}
            view={currentProject ? 'editor' : 'homepage'}
          />
        )
      }

      {
        showAbout && (
          <AboutModal
            onClose={() => setShowAbout(false)}
            version="1.0.0"
          />
        )
      }

      {pendingMissing && currentProject && (
        <div className="project-dialog-backdrop" role="dialog" aria-labelledby="missing-media-title">
          <div className="project-dialog">
            <h3 id="missing-media-title">Media is missing</h3>
            <p>
              This project needs <strong>{pendingMissing.name}</strong>. Choose the file on this computer — Sublibr will copy it into the project.
            </p>
            <div className="project-dialog-actions">
              <button className="btn-primary" onClick={wrappedRelink}>Locate file</button>
              <button className="btn-secondary" onClick={dismissMissing}>Continue without media</button>
            </div>
          </div>
        </div>
      )}

      {deleteCandidate && (
        <div className="project-dialog-backdrop" role="dialog" aria-labelledby="delete-project-title">
          <div className="project-dialog">
            <h3 id="delete-project-title">
              {deleteStep === 1 ? 'Delete this project?' : 'Delete permanently?'}
            </h3>
            <p>
              {deleteStep === 1
                ? `“${deleteCandidate.name}” will be removed from your projects folder.`
                : 'This cannot be undone. The project folder and copied media will be deleted.'}
            </p>
            <div className="project-dialog-actions">
              <button className="btn-danger" onClick={confirmDelete}>
                {deleteStep === 1 ? 'Delete' : 'Delete permanently'}
              </button>
              <button className="btn-secondary" onClick={cancelDelete}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {renameTarget && (
        <RenameProjectDialog
          initialName={renameTarget.name}
          onCancel={cancelRename}
          onSubmit={submitRename}
        />
      )}
    </div >
  );
}

function generateBlockedReason({
  hasMedia,
  transcribeReady,
  local,
  localWhisperOk,
}: {
  hasMedia: boolean;
  transcribeReady: boolean;
  local: boolean;
  localWhisperOk: boolean | null;
}): string {
  if (!hasMedia) return 'Add video or audio first.';
  if (local && localWhisperOk === null) return 'Checking offline setup…';
  if (local && localWhisperOk === false) return 'Offline transcription isn’t ready.';
  if (!transcribeReady) return 'Add an API key in Settings.';
  return 'Set up transcription in Settings.';
}

function TranscriptionModelButton({
  settings,
  onClick,
}: {
  settings: AppSettings;
  onClick: () => void;
}) {
  const activeConfig = settings.providers[settings.activeProvider];
  return (
    <button
      type="button"
      className={`active-model-badge${settings.activeProvider === 'local' ? ' is-local' : ' is-cloud'}`}
      onClick={onClick}
      title="Change transcription model"
    >
      <span className="icon icon-sm">{settings.activeProvider === 'local' ? 'computer' : 'cloud'}</span>
      <span className={`run-location-chip ${settings.activeProvider === 'local' ? 'is-offline' : 'is-cloud'}`}>
        {settings.activeProvider === 'local' ? 'Offline' : 'Online'}
      </span>
      <span className="active-model-label">Transcription</span>
      {settings.activeProvider !== 'local' && (
        <span>{PROVIDER_LABELS[settings.activeProvider]}</span>
      )}
      <span className="active-model-name">
        {transcriptionModelLabel(settings.activeProvider, activeConfig.model)}
      </span>
    </button>
  );
}

function RenameProjectDialog({
  initialName,
  onCancel,
  onSubmit,
}: {
  initialName: string;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  return (
    <div className="project-dialog-backdrop" role="dialog" aria-labelledby="rename-project-title">
      <form
        className="project-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSubmit(name);
        }}
      >
        <h3 id="rename-project-title">Rename project</h3>
        <label className="sidebar-hint" htmlFor="rename-project-input" style={{ display: 'block', marginBottom: 8 }}>
          Name
        </label>
        <input
          id="rename-project-input"
          className="project-rename-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          maxLength={80}
        />
        <div className="project-dialog-actions">
          <button type="submit" className="btn-primary" disabled={!name.trim()}>Rename</button>
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

export default App;
