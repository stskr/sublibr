import { useState, useEffect, useRef } from 'react';
import type { AppSettings, AIProvider } from '../types';
import { PROVIDER_LABELS, MODEL_OPTIONS, TRANSLATOR_MODEL_OPTIONS, PROVIDER_KEY_URLS, testApiKey, providerNeedsApiKey, CLOUD_PROVIDERS, resolveSavedModel } from '../services/providers';
import { CustomSelect } from './CustomSelect';

const ALL_PROVIDERS: AIProvider[] = ['local', 'gemini', 'openai'];

type SettingsTab = 'general' | 'models' | 'keys';

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
            <span className={`mode-label ${!online ? 'is-active is-offline' : ''}`}>Offline</span>
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
            <span className={`mode-label ${online ? 'is-active is-online' : ''}`}>Online</span>
        </div>
    );
}

interface SettingsProps {
    settings: AppSettings;
    onSettingsChange: (settings: AppSettings) => void;
    onClose: () => void;
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

export function Settings({ settings, onSettingsChange, onClose }: SettingsProps) {
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
        next.providers.local.model = resolveSavedModel('local', next.providers.local.model);
        return next;
    });
    const [tab, setTab] = useState<SettingsTab>('general');
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
                    model: TRANSLATOR_MODEL_OPTIONS.local[0].value,
                },
            };
        });
        setTimeout(() => { void handleTest('local'); }, 0);
    };

    const handleSave = () => {
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

    const transcribeOptions = (transcribeOnline ? readyCloud : ['local'] as const)
        .flatMap(p => MODEL_OPTIONS[p].map(m => ({
            value: `${p}:${m.value}`,
            label: p === 'local' ? m.label : `${PROVIDER_LABELS[p]} — ${m.label}`,
        })));

    const translateOptions = (translateOnline ? readyCloud : ['local'] as const)
        .flatMap(p => TRANSLATOR_MODEL_OPTIONS[p].map(m => ({
            value: `${p}:${m.value}`,
            label: p === 'local' ? m.label.replace(' (offline translator)', '') : `${PROVIDER_LABELS[p]} — ${m.label}`,
        })));

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
                        id="settings-panel-models"
                        role="tabpanel"
                        aria-labelledby="settings-tab-models"
                        className={`settings-panel ${tab === 'models' ? 'is-active' : ''}`}
                        aria-hidden={tab !== 'models'}
                        inert={tab !== 'models'}
                    >
                            <div className={`active-provider-hero ${transcribeOnline ? 'is-online' : 'is-offline'}`}>
                                <div className="hero-label-row">
                                    <label htmlFor="activeModel">Transcription</label>
                                    <OfflineOnlineSwitch
                                        id="transcribeMode"
                                        online={transcribeOnline}
                                        onChange={setTranscribeOnline}
                                        offlineLabel="Transcribe offline on this computer"
                                        onlineLabel="Transcribe online in the cloud"
                                    />
                                </div>
                                {transcribeOnline && transcribeOptions.length === 0 ? noOnlineModelsCallout : (
                                    <CustomSelect
                                        id="activeModel"
                                        value={transcribeSelectValue}
                                        onChange={(val) => {
                                            const [provider, model] = val.split(':') as [AIProvider, string];
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
                                <p className="setting-hint" style={{ marginTop: '8px', marginBottom: 0 }}>
                                    {transcribeOnline
                                        ? (transcribeOptions.length === 0
                                            ? 'Add a tested Gemini or OpenAI key to transcribe online.'
                                            : 'Audio is uploaded to this API. Only timestamped models can make subtitles.')
                                        : 'Whisper Large v3 Turbo on this computer. Hebrew uses dedicated weights. Audio never leaves this machine.'}
                                </p>
                                {!transcribeOnline && (
                                    <div className="local-setup-row">
                                        {localStatus === 'valid' ? (
                                            <span className="key-status-valid" aria-label="Local transcription ready">
                                                <span className="icon icon-sm">check_circle</span>
                                            </span>
                                        ) : localStatus === 'invalid' ? (
                                            <span className="key-status-invalid" aria-label="Local transcription not ready">
                                                <span className="icon icon-sm">cancel</span>
                                            </span>
                                        ) : null}
                                        <button
                                            className="test-key-btn btn-secondary"
                                            onClick={() => handleTest('local')}
                                            disabled={localStatus === 'testing'}
                                        >
                                            {localStatus === 'testing' ? (
                                                <span className="key-status-testing">
                                                    <span className="spinner-inline" />
                                                </span>
                                            ) : 'Check setup'}
                                        </button>
                                    </div>
                                )}
                                {!transcribeOnline && localStatus === 'invalid' && localError && (
                                    <p className="setting-hint key-error-text">{localError}</p>
                                )}
                            </div>

                            <div className={`active-provider-hero translator-hero ${translateOnline ? 'is-online' : 'is-offline'}`}>
                                <div className="hero-label-row">
                                    <label htmlFor="translatorModel">Translation</label>
                                    <OfflineOnlineSwitch
                                        id="translateMode"
                                        online={translateOnline}
                                        onChange={setTranslateOnline}
                                        offlineLabel="Translate offline on this computer"
                                        onlineLabel="Translate online in the cloud"
                                    />
                                </div>
                                {translateOnline && translateOptions.length === 0 ? noOnlineModelsCallout : (
                                    <CustomSelect
                                        id="translatorModel"
                                        value={translateSelectValue}
                                        onChange={(val) => {
                                            const [provider, model] = val.split(':') as [AIProvider, string];
                                            if (provider !== 'local') {
                                                lastCloudTranslate.current = provider;
                                                lastCloudTranslateModel.current = model;
                                            }
                                            setDraft(prev => ({
                                                ...prev,
                                                translator: { provider, model },
                                            }));
                                        }}
                                        options={translateOptions}
                                    />
                                )}
                                <p className="setting-hint" style={{ marginTop: '8px', marginBottom: 0 }}>
                                    {translateOnline
                                        ? (translateOptions.length === 0
                                            ? 'Add a tested Gemini or OpenAI key to translate online.'
                                            : 'Used for translation and language detection — not for transcription.')
                                        : 'Rewrites subtitle text on this computer. Whisper does not translate.'}
                                </p>
                                {!translateOnline && (
                                    <>
                                        <div className="local-setup-row">
                                            {localLlmReady ? (
                                                <span className="key-status-valid" aria-label="Local translator ready">
                                                    <span className="icon icon-sm">check_circle</span>
                                                </span>
                                            ) : localStatus === 'invalid' || (localStatus === 'valid' && !localLlmReady) ? (
                                                <span className="key-status-invalid" aria-label="Local translator not ready">
                                                    <span className="icon icon-sm">cancel</span>
                                                </span>
                                            ) : null}
                                            <button
                                                className="test-key-btn btn-secondary"
                                                onClick={() => handleTest('local')}
                                                disabled={localStatus === 'testing'}
                                            >
                                                {localStatus === 'testing' ? (
                                                    <span className="key-status-testing">
                                                        <span className="spinner-inline" />
                                                    </span>
                                                ) : 'Check setup'}
                                            </button>
                                        </div>
                                        {!localLlmReady && (
                                            <p className="setting-hint">
                                                Offline translation needs{' '}
                                                <code>models/Qwen2.5-7B-Instruct-Q4_K_M.gguf</code>
                                                .
                                            </p>
                                        )}
                                    </>
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
                                                    <button
                                                        className="test-key-btn btn-secondary"
                                                        onClick={() => handleTest(provider)}
                                                        disabled={status === 'testing' || !config.apiKey.trim()}
                                                    >
                                                        {status === 'testing' ? (
                                                            <span className="key-status-testing">
                                                                <span className="spinner-inline" />
                                                            </span>
                                                        ) : 'Test'}
                                                    </button>
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

                    <div
                        id="settings-panel-general"
                        role="tabpanel"
                        aria-labelledby="settings-tab-general"
                        className={`settings-panel ${tab === 'general' ? 'is-active' : ''}`}
                        aria-hidden={tab !== 'general'}
                        inert={tab !== 'general'}
                    >
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
                </div>

                <div className="settings-footer">
                    {!canSave && (
                        <span className="save-hint">
                            {transcribeOnline || translateOnline
                                ? 'Add an API key for each online task'
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
