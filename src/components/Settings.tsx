import { useState, useEffect, useRef } from 'react';
import type { AppSettings, AIProvider } from '../types';
import { PROVIDER_LABELS, MODEL_OPTIONS, PROVIDER_KEY_URLS, testApiKey } from '../services/providers';
import { CustomSelect } from './CustomSelect';

interface SettingsProps {
    settings: AppSettings;
    onSettingsChange: (settings: AppSettings) => void;
    onClose: () => void;
}

const ALL_PROVIDERS: AIProvider[] = ['gemini', 'anthropic', 'openai'];

type KeyStatus = 'idle' | 'testing' | 'valid' | 'invalid';

export function Settings({ settings, onSettingsChange, onClose }: SettingsProps) {
    const [draft, setDraft] = useState<AppSettings>(structuredClone(settings));

    // Initialize key status: keys that match saved non-empty keys start as 'valid'
    const [keyStatus, setKeyStatus] = useState<Record<AIProvider, KeyStatus>>(() => {
        const init = {} as Record<AIProvider, KeyStatus>;
        for (const p of ALL_PROVIDERS) {
            const saved = settings.providers[p].apiKey;
            init[p] = saved && saved === draft.providers[p].apiKey ? 'valid' : 'idle';
        }
        return init;
    });
    const [keyError, setKeyError] = useState<Record<AIProvider, string>>(
        () => ({ gemini: '', anthropic: '', openai: '' }),
    );

    const enabledProviders = ALL_PROVIDERS.filter(p => draft.providers[p].enabled);
    const hasAnyKey = ALL_PROVIDERS.some(p => draft.providers[p].apiKey.trim());

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
        const apiKey = draft.providers[provider].apiKey.trim();
        if (!apiKey) return;

        setKeyStatus(prev => ({ ...prev, [provider]: 'testing' }));
        setKeyError(prev => ({ ...prev, [provider]: '' }));

        const result = await testApiKey(provider, apiKey);

        setKeyStatus(prev => ({ ...prev, [provider]: result.ok ? 'valid' : 'invalid' }));
        if (!result.ok) {
            setKeyError(prev => ({ ...prev, [provider]: result.error || 'Invalid key' }));
        }
    };

    const handleToggle = (provider: AIProvider) => {
        const wasEnabled = draft.providers[provider].enabled;
        const nowEnabled = !wasEnabled;

        const next = {
            ...draft,
            providers: {
                ...draft.providers,
                [provider]: { ...draft.providers[provider], enabled: nowEnabled },
            },
        };

        // If we disabled the active provider, switch to first remaining enabled
        if (!nowEnabled && draft.activeProvider === provider) {
            const fallback = ALL_PROVIDERS.find(p => p !== provider && next.providers[p].enabled);
            if (fallback) {
                next.activeProvider = fallback;
            }
        }

        setDraft(next);
    };

    const handleSave = () => {
        onSettingsChange(draft);
        onClose();
    };

    const canSave =
        enabledProviders.length > 0 &&
        keyStatus[draft.activeProvider] === 'valid';

    const modalRef = useRef<HTMLDivElement>(null);

    // Focus trap + Escape key
    useEffect(() => {
        const prev = document.activeElement as HTMLElement;
        modalRef.current?.focus();

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { onClose(); return; }
            if (e.key !== 'Tab') return;
            const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            if (!focusable || focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => { document.removeEventListener('keydown', handleKeyDown); prev?.focus(); };
    }, [onClose]);

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

                <div className="settings-content">
                    {/* Active Model Hero */}
                    <div className="active-provider-hero">
                        <label htmlFor="activeModel">Active Model</label>
                        {hasAnyKey ? (
                            <CustomSelect
                                id="activeModel"
                                value={enabledProviders.length > 0 ? `${draft.activeProvider}:${draft.providers[draft.activeProvider].model}` : ''}
                                disabled={enabledProviders.length === 0}
                                onChange={(val) => {
                                    const [provider, model] = val.split(':') as [AIProvider, string];
                                    setDraft(prev => ({
                                        ...prev,
                                        activeProvider: provider,
                                        providers: {
                                            ...prev.providers,
                                            [provider]: { ...prev.providers[provider], model },
                                        },
                                    }));
                                }}
                                options={[
                                    ...(enabledProviders.length === 0 ? [{ value: '', label: 'Enable a provider below', disabled: true }] : []),
                                    ...enabledProviders.flatMap(p =>
                                        MODEL_OPTIONS[p].map(m => ({
                                            value: `${p}:${m.value}`,
                                            label: `${PROVIDER_LABELS[p]} — ${m.label}`,
                                        }))
                                    ),
                                ]}
                            />
                        ) : (
                            <div className="hero-info-banner">
                                <span className="icon icon-sm">info</span>
                                <span>Toggle the providers you'd like to use below and paste an API key for each one.</span>
                            </div>
                        )}
                    </div>

                    {/* Provider Sections */}
                    {ALL_PROVIDERS.map(provider => {
                        const config = draft.providers[provider];
                        const keyUrl = PROVIDER_KEY_URLS[provider];
                        const status = keyStatus[provider];
                        const error = keyError[provider];

                        return (
                            <div key={provider} className={`provider-section ${!config.enabled ? 'provider-disabled' : ''}`}>
                                <div className="provider-header">
                                    <span className="provider-name">{PROVIDER_LABELS[provider]}</span>
                                    <label className="provider-toggle-switch">
                                        <input
                                            type="checkbox"
                                            checked={config.enabled}
                                            onChange={() => handleToggle(provider)}
                                            aria-label={`Enable ${PROVIDER_LABELS[provider]}`}
                                        />
                                        <span className="toggle-slider" />
                                    </label>
                                </div>

                                {config.enabled && (
                                    <div className="provider-fields">
                                        <div className="setting-group">
                                            <label htmlFor={`apiKey-${provider}`}>API Key</label>
                                            <div className="api-key-row">
                                                <input
                                                    id={`apiKey-${provider}`}
                                                    type="password"
                                                    value={config.apiKey}
                                                    onChange={(e) => handleKeyChange(provider, e.target.value)}
                                                    placeholder="Enter your API key..."
                                                    className="input-field"
                                                />
                                                {status === 'valid' ? (
                                                    <span className="key-status-valid" aria-label="API key valid">
                                                        <span className="icon icon-sm">check_circle</span>
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
                                            <p className="setting-hint">
                                                Get your key from{' '}
                                                <a href={keyUrl.url} target="_blank" rel="noopener noreferrer">
                                                    {keyUrl.label}
                                                </a>
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="settings-footer">
                    {!canSave && enabledProviders.length > 0 && (
                        <span className="save-hint">Test the active provider's API key first</span>
                    )}
                    <button className="btn-secondary" onClick={onClose}>Cancel</button>
                    <button className="btn-primary" onClick={handleSave} disabled={!canSave}>
                        Save Settings
                    </button>
                </div>
            </div>
        </div>
    );
}
