import { useState, useCallback, useEffect } from 'react';
import type { SubtitleVersion, Subtitle, MediaFile, AppSettings } from '../types';
import { generateId } from '../utils';

interface UseVersionHistoryProps {
    mediaFile: MediaFile | null;
    subtitles: Subtitle[]; // Current subtitles in editor
    resetSubtitles: (subs: Subtitle[]) => void;
    settings: AppSettings;
}

export function useVersionHistory({
    mediaFile,
    subtitles,
    resetSubtitles,
    settings
}: UseVersionHistoryProps) {
    const [versions, setVersions] = useState<SubtitleVersion[]>([]);
    const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
    const [showGenerator, setShowGenerator] = useState(false);

    // Debounced auto-save of versions when they change
    useEffect(() => {
        if (!mediaFile || !window.electronAPI) return;

        const timeout = setTimeout(async () => {
            if (versions.length === 0 && subtitles.length === 0) return;
            try {
                await window.electronAPI.saveProject({
                    sourcePath: mediaFile.path,
                    name: mediaFile.name,
                    versions,
                    subtitles,
                });
            } catch (error) {
                console.error('Failed to save versions:', error);
            }
        }, 500);

        return () => clearTimeout(timeout);
    }, [versions, mediaFile, subtitles]);

    const persistVersions = useCallback((newVersions: SubtitleVersion[]) => {
        if (mediaFile && window.electronAPI) {
            window.electronAPI.saveProject({
                sourcePath: mediaFile.path,
                name: mediaFile.name,
                versions: newVersions,
                subtitles,
            }).catch((error) => {
                console.error('Failed to save versions:', error);
            });
        }
    }, [mediaFile, subtitles]);

    const addVersion = useCallback((newVersion: SubtitleVersion) => {
        setVersions(prev => {
            const updated = [...prev, newVersion];
            persistVersions(updated);
            return updated;
        });
        setActiveVersionId(newVersion.id);
    }, [persistVersions]);

    const handleRegenerate = useCallback(() => {
        let updatedVersions = versions;

        if (versions.length === 0 && subtitles.length > 0) {
            const restoredVersion: SubtitleVersion = {
                id: generateId(),
                timestamp: Date.now(),
                provider: settings.activeProvider,
                model: settings.providers[settings.activeProvider].model,
                language: settings.language,
                subtitles: subtitles,
                label: `Restored V (${settings.language}, ${settings.providers[settings.activeProvider].model})`,
            };
            updatedVersions = [restoredVersion];
            setVersions(updatedVersions);
            persistVersions(updatedVersions);
        } else if (activeVersionId) {
            updatedVersions = versions.map(v => v.id === activeVersionId ? { ...v, subtitles } : v);
            setVersions(updatedVersions);
            persistVersions(updatedVersions);
        }
        setShowGenerator(true);
    }, [activeVersionId, subtitles, versions, settings, persistVersions]);

    const handleVersionSelect = useCallback((versionId: string) => {
        let updatedVersions = versions;

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

    return {
        versions,
        setVersions,
        activeVersionId,
        setActiveVersionId,
        showGenerator,
        setShowGenerator,
        addVersion,
        handleRegenerate,
        handleVersionSelect,
        persistVersions
    };
}
