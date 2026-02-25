import { useState, useEffect, useCallback, useRef } from 'react';
import { Settings } from './components/Settings';
import { FileUpload } from './components/FileUpload';
import { SubtitleEditor } from './components/SubtitleEditor';
import { ShortcutsModal } from './components/ShortcutsModal';
import { AboutModal } from './components/AboutModal';
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
import type { Subtitle, AppSettings, MediaFile, RecentFile, ScreenSize } from './types';
import { DEFAULT_SUBTITLE_STYLE } from './types';
import { PROVIDER_LABELS, MODEL_OPTIONS } from './services/providers';
import { SubtitleStylePanel } from './components/SubtitleStylePanel';

import './App.css';
import logoWhite from './assets/Logo/logo-white.svg';

const DEFAULT_SETTINGS: AppSettings = {
  activeProvider: 'gemini',
  providers: {
    gemini: { enabled: true, apiKey: '', model: 'gemini-2.5-flash', freeTier: false },
    openai: { enabled: false, apiKey: '', model: 'gpt-4o-mini' },
  },
  language: 'English',
  autoDetectLanguage: false,
  screenSize: 'wide',
  subtitleStyle: DEFAULT_SUBTITLE_STYLE,
};

const DEFAULT_SUBTITLE_DURATION = 2; // seconds

function App() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
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
      if (!window.electronAPI) return;
      const saved = await window.electronAPI.getStoreValue('settings') as Record<string, unknown> | null;
      if (saved) {
        if ('apiKey' in saved && !('providers' in saved)) {
          const migrated: AppSettings = {
            ...DEFAULT_SETTINGS,
            providers: {
              ...DEFAULT_SETTINGS.providers,
              gemini: {
                ...DEFAULT_SETTINGS.providers.gemini,
                enabled: true,
                apiKey: (saved.apiKey as string) || '',
                model: (saved.model as string) || 'gemini-2.5-flash',
              },
            },
            language: (saved.language as string) || 'English',
            autoDetectLanguage: (saved.autoDetectLanguage as boolean) ?? false,
            screenSize: (saved.screenSize as ScreenSize) || 'wide',
          };
          setSettings(migrated);
          await window.electronAPI.setStoreValue('settings', migrated);
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
          // Deep-merge providers so new ProviderConfig fields (e.g. freeTier) get their
          // defaults even when loading settings saved before those fields existed.
          const mergedProviders = {
            ...DEFAULT_SETTINGS.providers,
            ...savedSettings.providers,
            gemini: { ...DEFAULT_SETTINGS.providers.gemini, ...savedSettings.providers?.gemini },
            openai: { ...DEFAULT_SETTINGS.providers.openai, ...savedSettings.providers?.openai },
          };
          const merged: AppSettings = { ...DEFAULT_SETTINGS, ...savedSettings, providers: mergedProviders, subtitleStyle: mergedSubtitleStyle };
          setSettings(merged);
          if (needsPositionMigration && window.electronAPI) {
            window.electronAPI.setStoreValue('settings', { ...merged, settingsVersion: 3 }).catch(() => {});
          }
        }
      }
    }
    loadSettings();
  }, []);

  const handleSettingsChange = useCallback(async (newSettings: AppSettings) => {
    setSettings(newSettings);
    if (window.electronAPI) {
      await window.electronAPI.setStoreValue('settings', newSettings);
    }
  }, []);

  // 1. Media Manager
  const mediaManager = useMediaManager();
  const {
    mediaFile,
    audioPath,
    duration,
    recentFiles,
    highlightedRecentIndex,
    processingError,
    isAnalyzing,
    setDuration,
    setHighlightedRecentIndex,
    addToRecents,
    handleClearRecents,
    processFile: coreProcessFile,
    handleFileSelect: coreFileSelect,
    handleLoadRecent: coreLoadRecent,
    handleNavigateRecentUp,
    handleNavigateRecentDown,
    clearMedia
  } = mediaManager;

  // 2. Version History
  const versionHistory = useVersionHistory({
    mediaFile,
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
  const wrappedLoadRecent = useCallback(async (recent: RecentFile) => {
    const data = await coreLoadRecent(recent);
    if (!data) return;
    setVersions(data.cachedVersions);
    if (data.cachedVersions.length > 0) {
      setActiveVersionId(data.cachedVersions[data.cachedVersions.length - 1].id);
    } else {
      setActiveVersionId(null);
    }
    resetSubtitles(data.subsToLoad);
    setShowGenerator(!data.hasSubtitles);
    setCurrentTime(0);
  }, [coreLoadRecent, setVersions, setActiveVersionId, resetSubtitles, setShowGenerator]);

  const wrappedProcessFile = useCallback(async (filePath: string) => {
    const data = await coreProcessFile(filePath);
    if (!data) return;
    setVersions(data.cachedVersions);
    if (data.cachedVersions.length > 0) {
      setActiveVersionId(data.cachedVersions[data.cachedVersions.length - 1].id);
      resetSubtitles(data.subsToLoad);
      setShowGenerator(false);
    } else {
      setActiveVersionId(null);
      resetSubtitles([]);
      setShowGenerator(true);
    }
    setCurrentTime(0);
  }, [coreProcessFile, setVersions, setActiveVersionId, resetSubtitles, setShowGenerator]);

  const wrappedFileSelect = useCallback(async (file: MediaFile) => {
    const data = await coreFileSelect(file);
    if (!data) return;
    setVersions(data.cachedVersions);
    if (data.cachedVersions.length > 0) {
      setActiveVersionId(data.cachedVersions[data.cachedVersions.length - 1].id);
      resetSubtitles(data.subsToLoad);
      setShowGenerator(false);
    } else {
      setActiveVersionId(null);
      resetSubtitles([]);
      setShowGenerator(true);
    }
    setCurrentTime(0);
  }, [coreFileSelect, setVersions, setActiveVersionId, resetSubtitles, setShowGenerator]);

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
    addToRecents,
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

  // Auto-select Subtitle Format + Render Resolution based on video aspect ratio when a file is loaded.
  // Uses functional setSettings to avoid reading stale 'settings' from the closure
  // (loadSettings is async and may not have committed yet when mediaFile first changes).
  useEffect(() => {
    if (!mediaFile?.isVideo || !mediaFile.width || !mediaFile.height) return;
    const ratio = mediaFile.width / mediaFile.height;
    const inferred: 'wide' | 'square' | 'vertical' =
      ratio >= 1.5 ? 'wide' : ratio >= 0.75 ? 'square' : 'vertical';
    setSettings(prev => {
      const updated = { ...prev, screenSize: inferred };
      window.electronAPI?.setStoreValue('settings', updated).catch(() => {});
      return updated;
    });
    setRenderResolution(inferred);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaFile]);

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
    if (mediaFile || highlightedRecentIndex === null || !recentFiles[highlightedRecentIndex]) return;
    wrappedLoadRecent(recentFiles[highlightedRecentIndex]);
  }, [mediaFile, highlightedRecentIndex, recentFiles, wrappedLoadRecent]);

  const handleOpenFileShortcut = useCallback(async () => {
    if (mediaFile) return;
    if (!window.electronAPI) return;
    const filePath = await window.electronAPI.openFileDialog();
    if (filePath) {
      wrappedProcessFile(filePath);
    }
  }, [mediaFile, wrappedProcessFile]);

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
                clearMedia();
                resetSubtitles([]);
                setVersions([]);
                setActiveVersionId(null);
                setShowGenerator(true);
                setShowTranslator(false);
                setCurrentTime(0);
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
          <button className="btn-icon" onClick={() => setShowAbout(true)} title="About SUBLIBR" aria-label="About SUBLIBR">
            <span className="icon">info</span>
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
            onFileSelect={wrappedFileSelect}
            recentFiles={recentFiles}
            onLoadRecent={wrappedLoadRecent}
            onClearRecents={handleClearRecents}
            highlightedRecentIndex={highlightedRecentIndex}
            onProcessFile={wrappedProcessFile}
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

                  <div style={{ marginBottom: '1rem', marginTop: '1rem' }}>
                    <label className="sidebar-label">Subtitle Format</label>
                    <CustomSelect
                      options={[
                        { value: 'wide', label: 'Wide-screen (16:9)' },
                        { value: 'square', label: 'Square (1:1)' },
                        { value: 'vertical', label: 'Vertical (9:16)' },
                      ]}
                      value={settings.screenSize}
                      onChange={(value) => {
                        const updated = { ...settings, screenSize: value as ScreenSize };
                        setSettings(updated);
                        if (window.electronAPI) {
                          window.electronAPI.setStoreValue('settings', updated);
                        }
                      }}
                    />
                    <p className="sidebar-hint" style={{ marginTop: '0.25rem' }}>
                      {settings.screenSize === 'wide' && 'Max 40 chars per line, up to 2 lines'}
                      {settings.screenSize === 'square' && 'Max 25 chars per line, up to 2 lines'}
                      {settings.screenSize === 'vertical' && 'Max 15 chars per line, up to 2 lines'}
                    </p>
                  </div>

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

              {!isProcessing && showStylePanel && subtitles.length > 0 && (
                <SubtitleStylePanel
                  style={settings.subtitleStyle}
                  onChange={(newStyle) => {
                    const updated = { ...settings, subtitleStyle: newStyle };
                    setSettings(updated);
                    if (window.electronAPI) window.electronAPI.setStoreValue('settings', updated);
                  }}
                  onBack={() => setShowStylePanel(false)}
                  screenSize={settings.screenSize}
                />
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
                  >
                    <span className="icon icon-sm">translate</span> Translate
                  </button>
                  <button
                    className="btn-secondary sidebar-action-btn"
                    onClick={handleRegenerate}
                    style={{ marginBottom: '0.5rem', width: '100%' }}
                  >
                    <span className="icon icon-sm">refresh</span> Regenerate
                  </button>
                  <button
                    className="btn-secondary sidebar-action-btn"
                    onClick={() => setShowStylePanel(true)}
                    style={{ width: '100%' }}
                  >
                    <span className="icon icon-sm">palette</span> Global Style
                  </button>
                  <p className="sidebar-hint" style={{ marginTop: '0.4rem', marginBottom: '1.25rem' }}>
                    Switch to the Preview tab to see style changes live.
                  </p>

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
                  {mediaFile && ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.ts', '.mts', '.m2ts'].includes(mediaFile.ext) && (
                    <div style={{ marginTop: '1rem' }}>
                      <label className="sidebar-label">Render Resolution</label>
                      <CustomSelect
                        options={[
                          { value: 'wide', label: 'Wide-screen (16:9) — 1920×1080' },
                          { value: 'square', label: 'Square (1:1) — 1080×1080' },
                          { value: 'vertical', label: 'Vertical (9:16) — 1080×1920' },
                          ...(mediaFile.width && mediaFile.height
                            ? [{ value: 'original', label: `Original — ${mediaFile.width}×${mediaFile.height}` }]
                            : [{ value: 'original', label: 'Original — source size' }])
                        ]}
                        value={renderResolution}
                        onChange={(v) => setRenderResolution(v as ScreenSize)}
                      />
                      <button
                        className="btn-secondary sidebar-action-btn"
                        onClick={handleRenderVideo}
                        style={{ marginTop: '0.5rem', width: '100%' }}
                        title="Burn subtitles into the video using FFmpeg"
                      >
                        <span className="icon icon-sm">movie</span> Render Video
                      </button>
                    </div>
                  )}
                </div>
              )}

              <ProgressIndicator
                state={processing}
                providerLabel={PROVIDER_LABELS[settings.activeProvider]}
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
                mediaFile && (
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

      {
        showAbout && (
          <AboutModal
            onClose={() => setShowAbout(false)}
            version="1.0.0"
          />
        )
      }
    </div >
  );
}

export default App;
