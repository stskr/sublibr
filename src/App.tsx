import { useState, useEffect, useCallback } from 'react';
import { Settings } from './components/Settings';
import { FileUpload } from './components/FileUpload';
import { SubtitleEditor, TimelinePreview } from './components/SubtitleEditor';
import { AudioPlayer } from './components/AudioPlayer';
import { VideoPreview } from './components/VideoPreview';
import { ProgressIndicator } from './components/ProgressIndicator';
import { LanguageSelector } from './components/LanguageSelector';
import { createAudioChunks } from './services/audioProcessor';
import { transcribeChunk, mergeSubtitles, enforceSubtitleQuality, generateSrt } from './services/transcriber';
import { healSubtitles } from './services/healer';
import type { Subtitle, MediaFile, AppSettings, ProcessingState } from './types';

import './App.css';

const DEFAULT_SETTINGS: AppSettings = {
  apiKey: '',
  model: 'gemini-1.5-flash',
  language: 'English',
  autoDetectLanguage: false,
};

function App() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [mediaFile, setMediaFile] = useState<MediaFile | null>(null);
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [processing, setProcessing] = useState<ProcessingState>({ status: 'idle', progress: 0 });
  const [showVideoPreview, setShowVideoPreview] = useState(false);

  // Load settings on mount
  useEffect(() => {
    async function loadSettings() {
      // Guard: only load from electron store if running in Electron
      if (!window.electronAPI) {
        console.warn('Running in browser mode - Electron APIs not available');
        return;
      }
      const savedSettings = await window.electronAPI.getStoreValue('settings');
      if (savedSettings) {
        setSettings(savedSettings as AppSettings);
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
    setSubtitles([]);
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
    if (!audioPath || !settings.apiKey) {
      if (!settings.apiKey) {
        setShowSettings(true);
      }
      return;
    }

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
          settings.apiKey,
          settings.model,
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
          settings.apiKey,
          settings.model,
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

  // Download SRT
  const handleDownload = useCallback(async () => {
    if (subtitles.length === 0) return;

    const defaultName = mediaFile
      ? mediaFile.name.replace(/\.[^.]+$/, '.srt')
      : 'subtitles.srt';

    const savePath = await window.electronAPI.saveFileDialog(defaultName);
    if (savePath) {
      const srtContent = generateSrt(subtitles);
      await window.electronAPI.writeFile(savePath, srtContent);
    }
  }, [subtitles, mediaFile]);

  // Seek audio
  const handleSeek = useCallback((time: number) => {
    setCurrentTime(time);
    const seekFn = (window as { seekAudio?: (time: number) => void }).seekAudio;
    if (seekFn) seekFn(time);
  }, []);

  const canGenerate = audioPath && settings.apiKey && processing.status === 'idle';
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
                setSubtitles([]);
                setCurrentTime(0);
                setDuration(0);
                setProcessing({ status: 'idle', progress: 0 });
              }}
              title="Back to main screen"
            >
              <span className="icon">arrow_back</span>
            </button>
          )}
          <h1><span className="icon">subtitles</span> Subtitles Generator</h1>
        </div>
        <div className="header-actions">
          {subtitles.length > 0 && (
            <button className="btn-secondary" onClick={handleDownload}>
              <span className="icon icon-sm">download</span> Download SRT
            </button>
          )}
          {mediaFile?.isVideo && subtitles.length > 0 && (
            <button className="btn-secondary" onClick={() => setShowVideoPreview(true)}>
              <span className="icon icon-sm">visibility</span> Preview
            </button>
          )}
          <button className="btn-icon" onClick={() => setShowSettings(true)} title="Settings">
            <span className="icon">settings</span>
          </button>
        </div>
      </header>

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
              <div className="file-summary">
                <span className="icon icon-lg file-icon">{mediaFile.isVideo ? 'movie' : 'music_note'}</span>
                <div className="file-info">
                  <strong title={mediaFile.name}>{mediaFile.name}</strong>
                  <span>{Math.floor(duration / 60)}m {Math.floor(duration % 60)}s</span>
                </div>
              </div>

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
                </div>
              )}

              {subtitles.length > 0 && (
                <button
                  className="btn-primary download-btn"
                  onClick={handleDownload}
                  style={{ marginTop: '1rem', width: '100%', justifyContent: 'center' }}
                >
                  <span className="icon icon-sm">download</span> Download SRT
                </button>
              )}

              <ProgressIndicator state={processing} />
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

      {audioPath && (
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
          />
        </footer>
      )}

      {showSettings && (
        <Settings
          settings={settings}
          onSettingsChange={handleSettingsChange}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showVideoPreview && mediaFile?.isVideo && (
        <VideoPreview
          videoPath={mediaFile.path}
          subtitles={subtitles}
          onClose={() => setShowVideoPreview(false)}
        />
      )}
    </div>
  );
}

export default App;
