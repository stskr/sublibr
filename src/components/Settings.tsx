import { useState, useEffect, useRef } from 'react';
import type { AppSettings, AIProvider } from '../types';
import { PROVIDER_LABELS, MODEL_OPTIONS, TRANSLATOR_MODEL_OPTIONS, PROVIDER_KEY_URLS, testApiKey, providerNeedsApiKey, CLOUD_PROVIDERS, resolveSavedModel, resolveSavedTranslatorModel, localWhisperSelectOptions, localTranslatorSelectOptions } from '../services/providers';
import { LOCAL_WEIGHTS, formatWeightSize, type LocalWeightId } from '../services/localModelCatalog';
import { sanitizeImportedLocalModels } from '../services/importedLocalModels';
import type { OfflineDepId } from '../services/offlineSetup';
import { CustomSelect } from './CustomSelect';
import { StableLabelButton } from './StableLabelButton';

const ALL_PROVIDERS: AIProvider[] = ['local', 'gemini', 'openai'];

export type SettingsTab = 'general' | 'models' | 'keys';

function splitProviderModel(val: string): [AIProvider, string] {
    const i = val.indexOf(':');
    return [val.slice(0, i) as AIProvider, val.slice(i + 1)];
}

function OfflineOnlineSwitch({
    id,
    online,
    onChange,
    offlineLabel,
    onlineLabel,
}: {
    id: string;
    online: boolean;
    onChange: (online: boolean) => void;
    offlineLabel: string;
    onlineLabel: string;
}) {
    return (
        <div className={`offline-online-switch ${online ? 'is-online' : 'is-offline'}`}>
            <span className={`mode-label ${!online ? 'is-active is-offline' : ''}`}>Local</span>
            <label className="provider-toggle-switch">
                <input
                    id={id}
                    type="checkbox"
                    checked={online}
                    onChange={(e) => onChange(e.target.checked)}
                    aria-label={online ? onlineLabel : offlineLabel}
                />
                <span className="toggle-slider" />
            </label>
            <span className={`mode-label ${online ? 'is-active is-online' : ''}`}>Cloud</span>
        </div>
    );
}

interface SettingsProps {
    settings: AppSettings;
    onSettingsChange: (settings: AppSettings) => void;
    onClose: () => void;
    initialTab?: SettingsTab;
}

type KeyStatus = 'idle' | 'testing' | 'valid' | 'invalid' | 'unverified';

function isNetworkKeyError(message: string): boolean {
    return /could not reach the api|net::|ERR_FAILED|Failed to fetch|fetch failed|Network request failed|ENOTFOUND|ENETUNREACH|ECONNRESET|ETIMEDOUT|ECONNREFUSED|certificate|CERT_/i.test(message);
}

function cloudKeyReady(status: KeyStatus): boolean {
    return status === 'valid' || status === 'unverified';
}

function cloudKeySavable(status: KeyStatus, apiKey: string): boolean {
    if (!apiKey.trim()) return false;
    return status !== 'testing';
}

export function Settings({ settings, onSettingsChange, onClose, initialTab = 'general' }: SettingsProps) {
    const [draft, setDraft] = useState<AppSettings>(() => {
        const next = structuredClone(settings);
        if (typeof next.unloadAfterMinutes !== 'number' || !Number.isFinite(next.unloadAfterMinutes)) {
            next.unloadAfterMinutes = 5;
        }
        if (typeof next.projectsFolder !== 'string') {
            next.projectsFolder = '';
        }
        if (typeof next.projectsFolderSet !== 'boolean') {
            next.projectsFolderSet = false;
        }
        next.importedLocalModels = sanitizeImportedLocalModels(next.importedLocalModels);
        next.providers.local.model = resolveSavedModel('local', next.providers.local.model, next.importedLocalModels);
        if (next.translator.provider === 'local') {
            next.translator.model = resolveSavedTranslatorModel('local', next.translator.model, next.importedLocalModels);
        }
        return next;
    });
    const [tab, setTab] = useState<SettingsTab>(() => (
        initialTab === 'models' || initialTab === 'keys' ? initialTab : 'general'
    ));
    const [choosingFolder, setChoosingFolder] = useState(false);

    const [keyStatus, setKeyStatus] = useState<Record<AIProvider, KeyStatus>>(() => {
        const init = {} as Record<AIProvider, KeyStatus>;
        for (const p of ALL_PROVIDERS) {
            const saved = settings.providers[p].apiKey;
            init[p] = saved && saved === draft.providers[p].apiKey ? 'valid' : 'idle';
        }
        return init;
    });
    const [localLlmReady, setLocalLlmReady] = useState(false);
    const [weightFiles, setWeightFiles] = useState<Array<{
        id: string;
        file: string;
        present: boolean;
        bytesOnDisk: number;
        bytesExpected: number;
    }>>([]);
    const [weightProgress, setWeightProgress] = useState<Record<string, { percent: number; status: string; error?: string }>>({});
    const [setupStatus, setSetupStatus] = useState<{
        brew: { present: boolean; path: string | null };
        items: Array<{
            id: string;
            label: string;
            why: string;
            present: boolean;
            install: 'none' | 'brew' | 'download';
            formula?: string;
            detail: string;
            bytes?: number;
            neededFor: 'transcribe' | 'translate';
        }>;
    } | null>(null);
    const [setupProgress, setSetupProgress] = useState<Record<string, { status: string; percent?: number; detail?: string; error?: string }>>({});
    const [setupConsent, setSetupConsent] = useState(false);
    const [setupBusy, setSetupBusy] = useState(false);
    const [setupError, setSetupError] = useState('');
    const [importError, setImportError] = useState('');
    const [importing, setImporting] = useState<'whisper' | 'llama' | null>(null);
    const [keyError, setKeyError] = useState<Record<AIProvider, string>>(
        () => ({ gemini: '', openai: '', local: '' }),
    );

    const lastCloudTranscribe = useRef<AIProvider>(
        settings.activeProvider === 'local' ? 'gemini' : settings.activeProvider,
    );
    const lastCloudTranslate = useRef<AIProvider>(
        settings.translator.provider === 'local' ? 'gemini' : settings.translator.provider,
    );
    const lastCloudTranslateModel = useRef(
        settings.translator.provider === 'local'
            ? TRANSLATOR_MODEL_OPTIONS.gemini[0].value
            : settings.translator.model,
    );
    const lastLocalTranslate = useRef(
        settings.translator.provider === 'local'
            ? settings.translator.model
            : TRANSLATOR_MODEL_OPTIONS.local[0].value,
    );

    const transcribeOnline = draft.activeProvider !== 'local';
    const translateOnline = draft.translator.provider !== 'local';
    const readyCloud = CLOUD_PROVIDERS.filter(p => cloudKeyReady(keyStatus[p]));

    const updateProvider = (provider: AIProvider, patch: Partial<AppSettings['providers'][AIProvider]>) => {
        setDraft(prev => ({
            ...prev,
            providers: {
                ...prev.providers,
                [provider]: { ...prev.providers[provider], ...patch },
            },
        }));
    };

    const handleKeyChange = (provider: AIProvider, value: string) => {
        updateProvider(provider, { apiKey: value });
        setKeyStatus(prev => ({ ...prev, [provider]: 'idle' }));
        setKeyError(prev => ({ ...prev, [provider]: '' }));
    };

    const handleTest = async (provider: AIProvider) => {
        if (providerNeedsApiKey(provider) && !draft.providers[provider].apiKey.trim()) return;

        setKeyStatus(prev => ({ ...prev, [provider]: 'testing' }));
        setKeyError(prev => ({ ...prev, [provider]: '' }));

        try {
            const result = await testApiKey(provider, draft.providers[provider].apiKey.trim());
            if (provider === 'local') {
                setLocalLlmReady(Boolean(result.llm));
            }
            if (result.ok) {
                setKeyStatus(prev => ({ ...prev, [provider]: 'valid' }));
                return;
            }
            const error = result.error || 'Invalid key';
            const network = provider !== 'local' && isNetworkKeyError(error);
            setKeyStatus(prev => ({ ...prev, [provider]: network ? 'unverified' : 'invalid' }));
            setKeyError(prev => ({ ...prev, [provider]: error }));
        } catch (e) {
            const error = e instanceof Error ? e.message : 'Could not test this key';
            const network = provider !== 'local' && isNetworkKeyError(error);
            setKeyStatus(prev => ({ ...prev, [provider]: network ? 'unverified' : 'invalid' }));
            setKeyError(prev => ({ ...prev, [provider]: error }));
            if (provider === 'local') setLocalLlmReady(false);
        }
    };

    const refreshLocalWeights = async () => {
        const api = window.electronAPI;
        if (!api?.getLocalModelStatus) return;
        const status = await api.getLocalModelStatus();
        setWeightFiles(status.files);
        if (api.getOfflineSetupStatus) {
            setSetupStatus(await api.getOfflineSetupStatus());
        }
    };

    const downloadWeight = async (id: LocalWeightId) => {
        const api = window.electronAPI;
        if (!api?.downloadLocalModel) return;
        setWeightProgress(prev => ({ ...prev, [id]: { percent: 0, status: 'downloading' } }));
        try {
            await api.downloadLocalModel(id);
            await refreshLocalWeights();
            await handleTest('local');
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Download failed';
            if (!/cancelled/i.test(message)) {
                setWeightProgress(prev => ({ ...prev, [id]: { percent: 0, status: 'error', error: message } }));
            }
        }
    };

    const cancelWeight = (id: LocalWeightId) => {
        void window.electronAPI?.cancelLocalModelDownload?.(id);
    };

    const installOffline = async (ids: OfflineDepId[]) => {
        const api = window.electronAPI;
        if (!api?.installOfflineDeps) return;
        setSetupBusy(true);
        setSetupError('');
        try {
            await api.installOfflineDeps(ids);
            await refreshLocalWeights();
            await handleTest('local');
            setSetupConsent(false);
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Setup failed';
            if (!/cancelled/i.test(message)) setSetupError(message);
        } finally {
            setSetupBusy(false);
        }
    };

    const importLocalModel = async (runtime: 'whisper' | 'llama') => {
        const api = window.electronAPI;
        if (!api?.openModelFileDialog) return;
        setImportError('');
        setImporting(runtime);
        try {
            const result = await api.openModelFileDialog(runtime);
            if (!result || 'cancelled' in result) return;
            if (!result.ok) {
                setImportError(result.error);
                return;
            }
            setDraft((prev) => {
                const imported = [...sanitizeImportedLocalModels(prev.importedLocalModels), result.model];
                if (result.model.runtime === 'whisper') {
                    return {
                        ...prev,
                        importedLocalModels: imported,
                        activeProvider: 'local',
                        providers: {
                            ...prev.providers,
                            local: { ...prev.providers.local, model: result.model.id },
                        },
                    };
                }
                lastLocalTranslate.current = result.model.id;
                return {
                    ...prev,
                    importedLocalModels: imported,
                    translator: { provider: 'local', model: result.model.id },
                };
            });
            void handleTest('local');
        } catch (e) {
            setImportError(e instanceof Error ? e.message : 'Could not add that file.');
        } finally {
            setImporting(null);
        }
    };

    const removeImportedModel = (id: string) => {
        setDraft((prev) => {
            const imported = prev.importedLocalModels.filter((item) => item.id !== id);
            let next: AppSettings = { ...prev, importedLocalModels: imported };
            if (prev.providers.local.model === id) {
                next = {
                    ...next,
                    providers: {
                        ...next.providers,
                        local: { ...next.providers.local, model: 'whisper-large-v3-turbo' },
                    },
                };
            }
            if (prev.translator.model === id) {
                lastLocalTranslate.current = TRANSLATOR_MODEL_OPTIONS.local[0].value;
                next = {
                    ...next,
                    translator: { ...next.translator, model: TRANSLATOR_MODEL_OPTIONS.local[0].value },
                };
            }
            return next;
        });
    };

    const pickCloud = (preferred: AIProvider, ready: AIProvider[]): AIProvider => {
        if (ready.includes(preferred)) return preferred;
        return ready[0] ?? (preferred === 'openai' ? 'openai' : 'gemini');
    };

    const setTranscribeOnline = (online: boolean) => {
        if (online) {
            const ready = CLOUD_PROVIDERS.filter(p => cloudKeyReady(keyStatus[p]));
            if (ready.length === 0) setTab('keys');
            setDraft(prev => {
                if (prev.activeProvider !== 'local') lastCloudTranscribe.current = prev.activeProvider;
                const cloud = pickCloud(lastCloudTranscribe.current, ready);
                lastCloudTranscribe.current = cloud;
                return { ...prev, activeProvider: cloud };
            });
            return;
        }

        setDraft(prev => {
            if (prev.activeProvider !== 'local') lastCloudTranscribe.current = prev.activeProvider;
            return { ...prev, activeProvider: 'local' };
        });
        setTimeout(() => { void handleTest('local'); }, 0);
    };

    const setTranslateOnline = (online: boolean) => {
        if (online) {
            const ready = CLOUD_PROVIDERS.filter(p => cloudKeyReady(keyStatus[p]));
            if (ready.length === 0) setTab('keys');
            setDraft(prev => {
                if (prev.translator.provider !== 'local') {
                    lastCloudTranslate.current = prev.translator.provider;
                    lastCloudTranslateModel.current = prev.translator.model;
                }
                const cloud = pickCloud(lastCloudTranslate.current, ready);
                lastCloudTranslate.current = cloud;
                const savedModel = lastCloudTranslateModel.current;
                const model = TRANSLATOR_MODEL_OPTIONS[cloud].some(m => m.value === savedModel)
                    ? savedModel
                    : TRANSLATOR_MODEL_OPTIONS[cloud][0].value;
                return { ...prev, translator: { provider: cloud, model } };
            });
            return;
        }

        setDraft(prev => {
            if (prev.translator.provider !== 'local') {
                lastCloudTranslate.current = prev.translator.provider;
                lastCloudTranslateModel.current = prev.translator.model;
            }
            return {
                ...prev,
                translator: {
                    provider: 'local',
                    model: lastLocalTranslate.current,
                },
            };
        });
        setTimeout(() => { void handleTest('local'); }, 0);
    };

    const handleSave = () => {
        if (
            draft.translator.provider === 'local'
            && draft.translator.model !== settings.translator.model
        ) {
            void window.electronAPI?.stopLocalLlm?.();
        }
        onSettingsChange({
            ...draft,
            providers: {
                gemini: { ...draft.providers.gemini, enabled: cloudKeySavable(keyStatus.gemini, draft.providers.gemini.apiKey) },
                openai: { ...draft.providers.openai, enabled: cloudKeySavable(keyStatus.openai, draft.providers.openai.apiKey) },
                local: {
                    ...draft.providers.local,
                    enabled: draft.activeProvider === 'local' || draft.translator.provider === 'local',
                },
            },
        });
        onClose();
    };

    const handleChangeFolder = async () => {
        if (!window.electronAPI?.chooseProjectsFolder) return;
        setChoosingFolder(true);
        try {
            const folder = await window.electronAPI.chooseProjectsFolder();
            if (!folder) return;
            setDraft(prev => ({ ...prev, projectsFolder: folder, projectsFolderSet: true }));
            onSettingsChange({ ...settings, projectsFolder: folder, projectsFolderSet: true });
        } finally {
            setChoosingFolder(false);
        }
    };

    useEffect(() => {
        if (settings.projectsFolder && settings.projectsFolder !== draft.projectsFolder) {
            setDraft(prev => ({ ...prev, projectsFolder: settings.projectsFolder }));
        }
    }, [settings.projectsFolder, draft.projectsFolder]);

    useEffect(() => {
        if (draft.projectsFolder || !window.electronAPI?.getDefaultProjectsFolder) return;
        window.electronAPI.getDefaultProjectsFolder().then((folder) => {
            setDraft(prev => prev.projectsFolder ? prev : { ...prev, projectsFolder: folder });
        }).catch(() => {});
    }, [draft.projectsFolder]);

    const transcribeReady = transcribeOnline
        ? cloudKeySavable(keyStatus[draft.activeProvider], draft.providers[draft.activeProvider].apiKey)
        : keyStatus.local === 'valid';
    const translatorReady = translateOnline
        ? cloudKeySavable(keyStatus[draft.translator.provider], draft.providers[draft.translator.provider].apiKey)
        : localLlmReady;
    const canSave = transcribeReady && translatorReady;
    const isDirty = JSON.stringify(draft) !== JSON.stringify(settings);

    const presentIds = new Set(weightFiles.filter((item) => item.present).map((item) => item.id));
    const importedModels = sanitizeImportedLocalModels(draft.importedLocalModels);

    const transcribeOptions = transcribeOnline
        ? readyCloud.flatMap(p => MODEL_OPTIONS[p].map(m => ({
            value: `${p}:${m.value}`,
            label: `${PROVIDER_LABELS[p]} — ${m.label}`,
        })))
        : localWhisperSelectOptions(importedModels, presentIds, draft.providers.local.model).map((m) => ({
            value: `local:${m.value}`,
            label: m.label,
        }));

    const translateOptions = translateOnline
        ? readyCloud.flatMap(p => TRANSLATOR_MODEL_OPTIONS[p].map(m => ({
            value: `${p}:${m.value}`,
            label: `${PROVIDER_LABELS[p]} — ${m.label}`,
        })))
        : localTranslatorSelectOptions(importedModels, presentIds, draft.translator.model).map((m) => ({
            value: `local:${m.value}`,
            label: m.label,
        }));

    const transcribeSelectValue = transcribeOnline
        ? (readyCloud.includes(draft.activeProvider)
            ? `${draft.activeProvider}:${draft.providers[draft.activeProvider].model}`
            : '')
        : `local:${draft.providers.local.model}`;

    const translateSelectValue = translateOnline
        ? (readyCloud.includes(draft.translator.provider)
            ? `${draft.translator.provider}:${draft.translator.model}`
            : '')
        : `local:${draft.translator.model}`;

    const setupItems = (setupStatus?.items ?? []).filter((item) => {
        if (item.neededFor === 'transcribe' && transcribeOnline) return false;
        if (item.neededFor === 'translate' && translateOnline) return false;
        return true;
    });
    const setupMissing = setupItems.filter((item) => !item.present);
    const setupNeedsBrew = setupMissing.some((item) => item.install === 'brew');
    const showOfflineSetup = (!transcribeOnline || !translateOnline) && setupMissing.length > 0;

    const modalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const ready = CLOUD_PROVIDERS.filter(p => cloudKeyReady(keyStatus[p]));
        setDraft(prev => {
            let next = prev;
            if (prev.activeProvider !== 'local' && ready.length > 0 && !ready.includes(prev.activeProvider)) {
                next = { ...next, activeProvider: ready[0] };
            }
            if (prev.translator.provider !== 'local' && ready.length > 0 && !ready.includes(prev.translator.provider)) {
                next = {
                    ...next,
                    translator: {
                        provider: ready[0],
                        model: TRANSLATOR_MODEL_OPTIONS[ready[0]][0].value,
                    },
                };
            }
            return next;
        });
    }, [keyStatus.gemini, keyStatus.openai]);

    useEffect(() => {
        if (draft.activeProvider !== 'local' && draft.translator.provider !== 'local') return;
        void handleTest('local');
        // Probe once when Settings opens with either task offline.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        void refreshLocalWeights();
        const api = window.electronAPI;
        const stopDownload = api?.onLocalModelDownloadProgress?.((progress) => {
            setWeightProgress(prev => ({
                ...prev,
                [progress.id]: { percent: progress.percent, status: progress.status, error: progress.error },
            }));
            if (progress.status === 'done') {
                void refreshLocalWeights();
                void handleTest('local');
            }
        });
        const stopSetup = api?.onOfflineSetupProgress?.((progress) => {
            setSetupProgress(prev => ({
                ...prev,
                [progress.id]: {
                    status: progress.status,
                    percent: progress.percent,
                    detail: progress.detail,
                    error: progress.error,
                },
            }));
        });
        return () => {
            stopDownload?.();
            stopSetup?.();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const prev = document.activeElement as HTMLElement;
        modalRef.current?.focus();

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { onClose(); return; }
            if (e.key !== 'Tab') return;
            const focusable = [...(modalRef.current?.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            ) ?? [])].filter(el => !el.closest('[inert]') && !el.hasAttribute('disabled'));
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => { document.removeEventListener('keydown', handleKeyDown); prev?.focus(); };
    }, [onClose]);

    const localStatus = keyStatus.local;
    const localError = keyError.local;
    const testedKeyCount = readyCloud.length;

    const renderWeightDownloads = (kind: 'transcribe' | 'translate', tier?: 'recommended' | 'advanced') => {
        const specs = Object.values(LOCAL_WEIGHTS).filter((spec) => spec.for === kind && (!tier || spec.tier === tier));
        if (specs.length === 0) return null;
        return (
        <div className="model-download-list">
            {specs.map((spec) => {
                const file = weightFiles.find((item) => item.id === spec.id);
                const progress = weightProgress[spec.id];
                const downloading = progress?.status === 'downloading';
                const present = Boolean(file?.present);
                const sizeLabel = present && file?.bytesOnDisk
                    ? formatWeightSize(file.bytesOnDisk)
                    : spec.detail;
                return (
                    <div key={spec.id} className="model-download-row">
                        <div className="model-download-copy">
                            <span className="model-download-name">{spec.label}</span>
                            <span className="setting-hint">
                                {present ? `On this computer · ${sizeLabel}` : spec.detail}
                            </span>
                            {downloading && (
                                <div className="model-download-progress" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}>
                                    <span className="progress-bar-fill" style={{ width: `${progress.percent}%` }} />
                                </div>
                            )}
                            {progress?.status === 'error' && progress.error && (
                                <p className="setting-hint key-error-text">{progress.error}</p>
                            )}
                        </div>
                        {present ? (
                            <span className="model-on-disk">
                                <span className="icon icon-sm">check_circle</span>
                                On this computer
                            </span>
                        ) : (
                            <StableLabelButton
                                className="btn-secondary btn-compact"
                                labels={['Download', 'Cancel']}
                                onClick={() => downloading ? cancelWeight(spec.id) : void downloadWeight(spec.id)}
                            >
                                {downloading ? 'Cancel' : 'Download'}
                            </StableLabelButton>
                        )}
                    </div>
                );
            })}
        </div>
        );
    };

    const noOnlineModelsCallout = (
        <div className="settings-empty-callout">
            <span className="icon icon-sm">vpn_key</span>
            <div>
                <p>No API keys yet. Add a key and tap Test to list that provider’s models.</p>
                <button type="button" className="text-link-btn" onClick={() => setTab('keys')}>
                    Open API keys
                </button>
            </div>
        </div>
    );

    return (
        <div className="settings-overlay">
            <div
                className="settings-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="settings-title"
                ref={modalRef}
                tabIndex={-1}
            >
                <div className="settings-header">
                    <h2 id="settings-title">Settings</h2>
                    <button className="close-btn" onClick={onClose} aria-label="Close settings">
                        <span className="icon">close</span>
                    </button>
                </div>

                <div className="settings-tabs" role="tablist" aria-label="Settings sections">
                    <button
                        type="button"
                        role="tab"
                        id="settings-tab-general"
                        aria-selected={tab === 'general'}
                        aria-controls="settings-panel-general"
                        className={`settings-tab ${tab === 'general' ? 'is-active' : ''}`}
                        onClick={() => setTab('general')}
                    >
                        General
                    </button>
                    <button
                        type="button"
                        role="tab"
                        id="settings-tab-models"
                        aria-selected={tab === 'models'}
                        aria-controls="settings-panel-models"
                        className={`settings-tab ${tab === 'models' ? 'is-active' : ''}`}
                        onClick={() => setTab('models')}
                    >
                        Models
                    </button>
                    <button
                        type="button"
                        role="tab"
                        id="settings-tab-keys"
                        aria-selected={tab === 'keys'}
                        aria-controls="settings-panel-keys"
                        className={`settings-tab ${tab === 'keys' ? 'is-active' : ''}`}
                        onClick={() => setTab('keys')}
                    >
                        API keys
                        <span className={`settings-tab-count ${testedKeyCount > 0 ? 'is-ready' : ''}`}>
                            {testedKeyCount}/2
                        </span>
                    </button>
                </div>

                <div className="settings-content">
                    <div
                        id="settings-panel-general"
                        role="tabpanel"
                        aria-labelledby="settings-tab-general"
                        className={`settings-panel ${tab === 'general' ? 'is-active' : ''}`}
                        aria-hidden={tab !== 'general'}
                        inert={tab !== 'general'}
                    >
                            {showOfflineSetup && (
                                <div className="offline-setup">
                                    <h3 className="settings-section-heading">Set up offline</h3>
                                    <p className="setting-hint setting-hint-flush">
                                        Sublibr only installs what is missing. Nothing is added until you consent below.
                                    </p>
                                    <ul className="offline-setup-list">
                                        {setupItems.map((item) => {
                                            const progress = setupProgress[item.id];
                                            const installing = setupBusy && !item.present && (progress?.status === 'installing' || progress?.status === 'downloading');
                                            return (
                                                <li key={item.id} className={`offline-setup-row ${item.present ? 'is-ready' : ''}`}>
                                                    <div className="offline-setup-copy">
                                                        <span className="model-download-name">{item.label}</span>
                                                        <span className="setting-hint">{item.why}</span>
                                                        <span className="setting-hint">
                                                            {installing
                                                                ? (progress?.detail || 'Working…')
                                                                : item.detail}
                                                        </span>
                                                        {installing && progress?.percent != null && (
                                                            <div className="model-download-progress" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}>
                                                                <span className="progress-bar-fill" style={{ width: `${progress.percent}%` }} />
                                                            </div>
                                                        )}
                                                    </div>
                                                    {item.present ? (
                                                        <span className="model-on-disk">
                                                            <span className="icon icon-sm">check_circle</span>
                                                            On this computer
                                                        </span>
                                                    ) : (
                                                        <span className="offline-setup-missing">Will install</span>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                    {setupNeedsBrew && setupStatus && !setupStatus.brew.present && (
                                        <p className="setting-hint key-error-text">
                                            Homebrew is not installed, so Sublibr cannot add whisper-cli or llama-server. Install Homebrew from{' '}
                                            <a href="https://brew.sh" target="_blank" rel="noopener noreferrer">brew.sh</a>
                                            , then come back. Model files can wait until then.
                                        </p>
                                    )}
                                    <label className="offline-setup-consent">
                                        <input
                                            type="checkbox"
                                            checked={setupConsent}
                                            onChange={(e) => setSetupConsent(e.target.checked)}
                                            disabled={setupBusy}
                                        />
                                        <span>
                                            Install the missing items listed above. Homebrew packages go through Homebrew; model files come from Hugging Face into this app’s models folder.
                                        </span>
                                    </label>
                                    {setupError && (
                                        <p className="setting-hint key-error-text">{setupError}</p>
                                    )}
                                    <div className="offline-setup-actions">
                                        {setupBusy ? (
                                            <StableLabelButton
                                                className="btn-secondary"
                                                labels={['Install missing', 'Cancel']}
                                                onClick={() => void window.electronAPI?.cancelOfflineSetup?.()}
                                            >
                                                Cancel
                                            </StableLabelButton>
                                        ) : (
                                            <StableLabelButton
                                                className="btn-primary"
                                                labels={['Install missing', 'Cancel']}
                                                disabled={!setupConsent || (setupNeedsBrew && !setupStatus?.brew.present)}
                                                onClick={() => void installOffline(setupMissing.map((item) => item.id as OfflineDepId))}
                                            >
                                                Install missing
                                            </StableLabelButton>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className={`active-provider-hero ${transcribeOnline ? 'is-online' : 'is-offline'}`}>
                                <div className="hero-label-row">
                                    <h3 className="settings-section-heading">
                                        <label htmlFor="activeModel">Transcription</label>
                                    </h3>
                                    <OfflineOnlineSwitch
                                        id="transcribeMode"
                                        online={transcribeOnline}
                                        onChange={setTranscribeOnline}
                                        offlineLabel="Transcribe locally on this computer"
                                        onlineLabel="Transcribe in the cloud"
                                    />
                                </div>
                                {transcribeOnline && transcribeOptions.length === 0 ? noOnlineModelsCallout : (
                                    <CustomSelect
                                        id="activeModel"
                                        value={transcribeSelectValue}
                                        onChange={(val) => {
                                            const [provider, model] = splitProviderModel(val);
                                            if (provider !== 'local') lastCloudTranscribe.current = provider;
                                            setDraft(prev => ({
                                                ...prev,
                                                activeProvider: provider,
                                                providers: {
                                                    ...prev.providers,
                                                    [provider]: { ...prev.providers[provider], model },
                                                },
                                            }));
                                        }}
                                        options={transcribeOptions}
                                    />
                                )}
                                <p className="setting-hint setting-hint-flush">
                                    {transcribeOnline
                                        ? (transcribeOptions.length === 0
                                            ? 'Add a tested Gemini or OpenAI key to transcribe in the cloud.'
                                            : 'Audio is uploaded to this API. Only timestamped models can make subtitles.')
                                        : 'Whisper Large v3 Turbo on this computer. Audio never leaves this machine. Optional Hebrew and smaller Whisper files are in Models.'}
                                </p>
                                {!transcribeOnline && (
                                    <>
                                        <button type="button" className="text-link-btn model-more-link" onClick={() => setTab('models')}>
                                            More models and custom files
                                        </button>
                                        {localStatus === 'invalid' && localError && (
                                            <p className="setting-hint key-error-text">{localError}</p>
                                        )}
                                    </>
                                )}
                            </div>

                            <div className={`active-provider-hero translator-hero ${translateOnline ? 'is-online' : 'is-offline'}`}>
                                <div className="hero-label-row">
                                    <h3 className="settings-section-heading">
                                        <label htmlFor="translatorModel">Translation</label>
                                    </h3>
                                    <OfflineOnlineSwitch
                                        id="translateMode"
                                        online={translateOnline}
                                        onChange={setTranslateOnline}
                                        offlineLabel="Translate locally on this computer"
                                        onlineLabel="Translate in the cloud"
                                    />
                                </div>
                                {translateOnline && translateOptions.length === 0 ? noOnlineModelsCallout : (
                                    <CustomSelect
                                        id="translatorModel"
                                        value={translateSelectValue}
                                        onChange={(val) => {
                                            const [provider, model] = splitProviderModel(val);
                                            if (provider !== 'local') {
                                                lastCloudTranslate.current = provider;
                                                lastCloudTranslateModel.current = model;
                                            } else {
                                                lastLocalTranslate.current = model;
                                            }
                                            setDraft(prev => ({
                                                ...prev,
                                                translator: { provider, model },
                                            }));
                                        }}
                                        options={translateOptions}
                                    />
                                )}
                                <p className="setting-hint setting-hint-flush">
                                    {translateOnline
                                        ? (translateOptions.length === 0
                                            ? 'Add a tested Gemini or OpenAI key to translate in the cloud.'
                                            : 'Used for translation and language detection — not for transcription.')
                                        : 'Rewrites subtitle text on this computer. Whisper does not translate.'}
                                </p>
                                {!translateOnline && (
                                    <>
                                        <button type="button" className="text-link-btn model-more-link" onClick={() => setTab('models')}>
                                            More models and custom files
                                        </button>
                                    </>
                                )}
                            </div>

                            <div className="projects-folder-section">
                                <h3 className="settings-section-heading">Projects folder</h3>
                                <p className="setting-hint projects-folder-hint">
                                    Sublibr stores each project in its own folder, with media copied into <code>media/</code> so you can open it elsewhere. API keys are never saved here. Session logs go in <code>logs/</code> (last 20 kept).
                                </p>
                                <div className="projects-folder-row">
                                    <code className="projects-folder-path" title={draft.projectsFolder}>
                                        {draft.projectsFolder || '…'}
                                    </code>
                                    <button
                                        type="button"
                                        className="btn-secondary projects-folder-btn"
                                        onClick={handleChangeFolder}
                                        disabled={choosingFolder}
                                    >
                                        Change folder
                                    </button>
                                </div>
                            </div>

                            <div className="memory-section">
                                <h3 className="settings-section-heading">Model memory</h3>
                                <div className="memory-row">
                                    <div className="memory-copy">
                                        <span className="memory-label">Unload model after inactivity</span>
                                        <p className="setting-hint">
                                            Frees the local translator after this many idle minutes. Whisper already unloads after each clip. Never keeps the translator loaded until you quit.
                                        </p>
                                    </div>
                                    <div className="stepper" role="group" aria-label="Unload after inactivity">
                                        <button
                                            type="button"
                                            className="stepper-btn"
                                            disabled={draft.unloadAfterMinutes <= 0}
                                            onClick={() => setDraft(prev => ({
                                                ...prev,
                                                unloadAfterMinutes: Math.max(0, prev.unloadAfterMinutes - 1),
                                            }))}
                                            aria-label="Decrease minutes"
                                        >
                                            <span className="icon icon-sm">remove</span>
                                        </button>
                                        <span className="stepper-value">
                                            {draft.unloadAfterMinutes <= 0
                                                ? 'Never'
                                                : `${draft.unloadAfterMinutes} ${draft.unloadAfterMinutes === 1 ? 'minute' : 'minutes'}`}
                                        </span>
                                        <button
                                            type="button"
                                            className="stepper-btn"
                                            disabled={draft.unloadAfterMinutes >= 60}
                                            onClick={() => setDraft(prev => ({
                                                ...prev,
                                                unloadAfterMinutes: Math.min(60, prev.unloadAfterMinutes + 1),
                                            }))}
                                            aria-label="Increase minutes"
                                        >
                                            <span className="icon icon-sm">add</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                    </div>

                    <div
                        id="settings-panel-models"
                        role="tabpanel"
                        aria-labelledby="settings-tab-models"
                        className={`settings-panel ${tab === 'models' ? 'is-active' : ''}`}
                        aria-hidden={tab !== 'models'}
                        inert={tab !== 'models'}
                    >
                        <p className="settings-tab-intro">
                            Everything Sublibr can run locally. Turbo is the default (99 languages). Hebrew Whisper and smaller sizes are optional. Rows marked On this computer are already in your models folder.
                        </p>

                        <div className="active-provider-hero is-offline">
                            <h3 className="settings-section-heading">Whisper files</h3>
                            <p className="setting-hint setting-hint-flush">
                                Same whisper-cli runtime. Smaller files are faster and less accurate.
                            </p>
                            {renderWeightDownloads('transcribe')}
                        </div>

                        <div className="active-provider-hero translator-hero is-offline">
                            <h3 className="settings-section-heading">Translator files</h3>
                            <p className="setting-hint setting-hint-flush">
                                Same numbered-line translation. After a download, pick it under General → Translation.
                            </p>
                            {renderWeightDownloads('translate')}
                        </div>

                        <div className="active-provider-hero is-offline">
                            <h3 className="settings-section-heading">Add your own files</h3>
                            <p className="setting-hint setting-hint-flush">
                                Files stay where they are — Sublibr does not copy multi-GB weights. Removing a row only forgets it in this app.
                            </p>
                            <div className="model-import-actions">
                                <StableLabelButton
                                    className="btn-secondary"
                                    labels={['Add Whisper file', 'Add translator GGUF', 'Checking…']}
                                    onClick={() => void importLocalModel('whisper')}
                                    disabled={importing !== null}
                                >
                                    {importing === 'whisper' ? 'Checking…' : 'Add Whisper file'}
                                </StableLabelButton>
                                <StableLabelButton
                                    className="btn-secondary"
                                    labels={['Add Whisper file', 'Add translator GGUF', 'Checking…']}
                                    onClick={() => void importLocalModel('llama')}
                                    disabled={importing !== null}
                                >
                                    {importing === 'llama' ? 'Checking…' : 'Add translator GGUF'}
                                </StableLabelButton>
                            </div>
                            {importError && (
                                <p className="setting-hint key-error-text">{importError}</p>
                            )}
                            {importedModels.length === 0 ? (
                                <p className="setting-hint">No custom files yet.</p>
                            ) : (
                                <div className="model-download-list">
                                    {importedModels.map((item) => (
                                        <div key={item.id} className="model-download-row">
                                            <div className="model-download-copy">
                                                <span className="model-download-name">{item.label}</span>
                                                <span className="setting-hint">
                                                    {item.runtime === 'whisper' ? 'Whisper' : 'Translator'} · {item.architecture}
                                                </span>
                                                <span className="model-import-path" title={item.path}>{item.path}</span>
                                            </div>
                                            <button
                                                type="button"
                                                className="btn-secondary test-key-btn"
                                                onClick={() => removeImportedModel(item.id)}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div
                        id="settings-panel-keys"
                        role="tabpanel"
                        aria-labelledby="settings-tab-keys"
                        className={`settings-panel ${tab === 'keys' ? 'is-active' : ''}`}
                        aria-hidden={tab !== 'keys'}
                        inert={tab !== 'keys'}
                    >
                            <p className="settings-tab-intro">
                                Test a key to add that provider’s models. If Test can’t reach the network, you can still save the key and try later.
                            </p>
                            {CLOUD_PROVIDERS.map(provider => {
                                const config = draft.providers[provider];
                                const keyUrl = PROVIDER_KEY_URLS[provider];
                                const status = keyStatus[provider];
                                const error = keyError[provider];

                                return (
                                    <div key={provider} className={`provider-section is-online ${cloudKeyReady(status) ? 'is-ready' : ''}`}>
                                        <div className="provider-header">
                                            <div className="provider-title">
                                                <span className="provider-name">{PROVIDER_LABELS[provider]}</span>
                                                {status === 'valid' && (
                                                    <span className="run-location-chip is-cloud">Ready</span>
                                                )}
                                                {status === 'unverified' && (
                                                    <span className="run-location-chip is-unverified">Unverified</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="provider-fields">
                                            <div className="setting-group">
                                                <label htmlFor={`apiKey-${provider}`}>API key</label>
                                                <div className="api-key-row">
                                                    <input
                                                        id={`apiKey-${provider}`}
                                                        type="password"
                                                        value={config.apiKey}
                                                        onChange={(e) => handleKeyChange(provider, e.target.value)}
                                                        placeholder="Paste your API key"
                                                        className="input-field"
                                                    />
                                                    {status === 'valid' ? (
                                                        <span className="key-status-valid" aria-label="API key valid">
                                                            <span className="icon icon-sm">check_circle</span>
                                                        </span>
                                                    ) : status === 'unverified' ? (
                                                        <span className="key-status-unverified" aria-label="API key saved but not verified">
                                                            <span className="icon icon-sm">wifi_off</span>
                                                        </span>
                                                    ) : status === 'invalid' ? (
                                                        <span className="key-status-invalid" aria-label="API key invalid">
                                                            <span className="icon icon-sm">cancel</span>
                                                        </span>
                                                    ) : null}
                                                    <StableLabelButton
                                                        className="test-key-btn btn-secondary"
                                                        labels={['Test']}
                                                        onClick={() => handleTest(provider)}
                                                        disabled={status === 'testing' || !config.apiKey.trim()}
                                                    >
                                                        {status === 'testing' ? (
                                                            <span className="key-status-testing">
                                                                <span className="spinner-inline" />
                                                            </span>
                                                        ) : 'Test'}
                                                    </StableLabelButton>
                                                </div>
                                                {status === 'invalid' && error && (
                                                    <p className="setting-hint key-error-text">{error}</p>
                                                )}
                                                {status === 'unverified' && error && (
                                                    <p className="setting-hint key-warning-text">
                                                        {error} You can still save this key.
                                                    </p>
                                                )}
                                                {status === 'idle' && config.apiKey.trim() && (
                                                    <p className="setting-hint">Test this key to list its models.</p>
                                                )}
                                                <p className="setting-hint">
                                                    Get a key from{' '}
                                                    <a href={keyUrl.url} target="_blank" rel="noopener noreferrer">
                                                        {keyUrl.label}
                                                    </a>
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                </div>

                <div className="settings-footer">
                    {!canSave && (
                        <span className="save-hint">
                            {transcribeOnline || translateOnline
                                ? 'Add an API key for each cloud task'
                                : 'Check the offline setup first'}
                        </span>
                    )}
                    <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                    <button
                        type="button"
                        className="btn-primary"
                        onClick={handleSave}
                        disabled={!canSave || !isDirty}
                    >
                        Save settings
                    </button>
                </div>
            </div>
        </div>
    );
}
