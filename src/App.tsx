import { useState, useEffect, useCallback } from 'react';
import { Settings } from './components/Settings';
import { FileUpload } from './components/FileUpload';
import { SubtitleEditor, TimelinePreview } from './components/SubtitleEditor';
import { ShortcutsModal } from './components/ShortcutsModal';
import { AudioPlayer } from './components/AudioPlayer';
import { VideoPreview } from './components/VideoPreview';
import { ProgressIndicator } from './components/ProgressIndicator';
import { LanguageSelector } from './components/LanguageSelector';
import { CustomSelect } from './components/CustomSelect';
import { createAudioChunks } from './services/audioProcessor';
import { transcribeChunk, mergeSubtitles, enforceSubtitleQuality, generateSrt, generateWebVtt, generateAss } from './services/transcriber';
import { healSubtitles } from './services/healer';
import { parseSubtitleFile } from './services/subtitleParser';
import { useUndoRedo } from './hooks/useUndoRedo';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { generateId } from './utils';
import type { Subtitle, MediaFile, AppSettings, ProcessingState, AIProvider } from './types';
import { PROVIDER_LABELS } from './services/providers';

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
  const [showVideoPreview, setShowVideoPreview] = useState(false);
  const [exportFormat, setExportFormat] = useState<'srt' | 'vtt' | 'ass'>('srt');

  // Load settings on mount
  useEffect(() => {
    async function loadSettings() {
      // Guard: only load from electron store if running in Electron
      if (!window.electronAPI) {
        console.warn('Running in browser mode - Electron APIs not available');
        return;
      }
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
          setSettings(saved as unknown as AppSettings);
        }
      }
    }
    loadSettings();
  }, []);

  // Save settings
  const handleSettingsChange = useCallback(async (newSettings: AppSettings) => {
    setSettings(newSettings);
    if (window.electronAPI) {
      await window.electronAPI.setStoreValue('settings', newSettings);
    }
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
        const audioOutput = `${tempDir}/subtitles_gen_audio_${Date.now()}.mp3`;
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
      // Step 1: Detect silences and create chunks
      setProcessing({ status: 'detecting-silences', progress: 15 });
      const tempDir = await window.electronAPI.getTempPath();


      setProcessing({ status: 'splitting', progress: 25 });
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
      }

      // Step 3: Merge subtitles
      setProcessing({ status: 'merging', progress: 90 });
      let merged = mergeSubtitles(allSubtitles);

      // Step 4: Heal Gaps
      setProcessing({ status: 'healing', progress: 95 });
      try {
        merged = await healSubtitles(
          merged,
          audioPath,
          silences,
          provider,
          apiKey,
          model,
          settings.language,
          settings.autoDetectLanguage
        );
      } catch (err) {
        console.error('Healing failed:', err);
        // Continue with merged subtitles even if healing fails
      }

      // Step 5: Enforce subtitle quality (min duration, merge short subs, punctuation)
      merged = enforceSubtitleQuality(merged);

      setSubtitles(merged);
      setProcessing({ status: 'done', progress: 100 });

      // Reset after brief delay
      setTimeout(() => {
        setProcessing({ status: 'idle', progress: 0 });
      }, 2000);

    } catch (error) {
      setProcessing({
        status: 'error',
        progress: 0,
        error: error instanceof Error ? error.message : 'Transcription failed',
      });
    }
  }, [audioPath, settings]);

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

      setSubtitles(loaded);
    } catch (err) {
      setProcessing({
        status: 'error',
        progress: 0,
        error: err instanceof Error ? err.message : 'Failed to load subtitle file',
      });
    }
  }, [setSubtitles]);

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

    const savePath = await window.electronAPI.saveFileDialog(defaultName);
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
      index: 0, // Will act as placeholder, re-indexing could happen on save/render if needed mostly visual
      startTime: startTime,
      endTime: startTime + 2,
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
        <div className="header-title">
          {mediaFile && (
            <button
              className="btn-icon"
              onClick={() => {
                setMediaFile(null);
                setAudioPath(null);
                resetSubtitles([]);
                setCurrentTime(0);
                setDuration(0);
                setProcessing({ status: 'idle', progress: 0 });
              }}
              title="Back to main screen"
            >
              <span className="icon">arrow_back</span>
            </button>
          )}
          <h1><img src={logoWhite} alt="SUBLIBR Logo" style={{ height: '32px' }} /> SUBLIBR</h1>
        </div>
        <div className="header-actions">
          {mediaFile?.isVideo && subtitles.length > 0 && (
            <button className="btn-secondary" onClick={() => setShowVideoPreview(true)}>
              <span className="icon icon-sm">visibility</span> Preview
            </button>
          )}

          <button className="btn-icon" onClick={() => setShowShortcuts(true)} title="Keyboard Shortcuts">
            <span className="icon">keyboard</span>
          </button>
          <button className="btn-icon" onClick={() => setShowSettings(true)} title="Settings">
            <span className="icon">settings</span>
          </button>
        </div>
      </header >

      <main className="app-main">
        {!mediaFile ? (
          <FileUpload
            settings={settings}
            onFileSelect={handleFileSelect}
            onLanguageChange={(language, autoDetect) => {
              setSettings(prev => ({ ...prev, language, autoDetectLanguage: autoDetect }));
            }}
          />
        ) : (
          <div className="editor-container">
            <div className="editor-sidebar">
              {!isProcessing && subtitles.length === 0 && (
                <div className="sidebar-section">
                  <LanguageSelector
                    language={settings.language}
                    autoDetect={settings.autoDetectLanguage}
                    onLanguageChange={(language, autoDetect) => {
                      setSettings(s => ({ ...s, language, autoDetectLanguage: autoDetect }));
                    }}
                  />

                  <button
                    className="btn-primary generate-btn"
                    onClick={handleGenerate}
                    disabled={!canGenerate}
                    style={{ marginTop: '1rem' }}
                  >
                    <span className="icon icon-sm">auto_awesome</span> Generate Subtitles
                  </button>

                  <div className="sidebar-divider">
                    <span>or</span>
                  </div>

                  <button
                    className="btn-secondary"
                    onClick={handleLoadSubtitles}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    <span className="icon icon-sm">upload_file</span> Load Subtitles
                  </button>
                </div>
              )}

              {subtitles.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <label className="sidebar-label">Export Format</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
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

              <ProgressIndicator state={processing} providerLabel={PROVIDER_LABELS[settings.activeProvider]} />
            </div>

            <div className="editor-main">
              <SubtitleEditor
                subtitles={subtitles}
                onSubtitlesChange={setSubtitles}
                currentTime={currentTime}
                onSeek={handleSeek}
              />
            </div>
          </div>
        )}
      </main>

      {
        audioPath && (
          <footer className="app-footer">
            {subtitles.length > 0 && (
              <TimelinePreview
                subtitles={subtitles}
                duration={duration}
                currentTime={currentTime}
                onSeek={handleSeek}
              />
            )}
            <AudioPlayer
              audioPath={audioPath}
              currentTime={currentTime}
              duration={duration}
              onTimeUpdate={setCurrentTime}
              onDurationChange={setDuration}
              fileName={mediaFile?.name}
            />
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
        showVideoPreview && mediaFile?.isVideo && (
          <VideoPreview
            videoPath={mediaFile.path}
            subtitles={subtitles}
            onClose={() => setShowVideoPreview(false)}
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
