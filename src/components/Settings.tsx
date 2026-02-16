import { useState } from 'react';
import type { AppSettings, AIProvider } from '../types';
import { PROVIDER_LABELS, MODEL_OPTIONS, PROVIDER_KEY_URLS } from '../services/providers';

interface SettingsProps {
    settings: AppSettings;
    onSettingsChange: (settings: AppSettings) => void;
    onClose: () => void;
}

const ALL_PROVIDERS: AIProvider[] = ['gemini', 'anthropic', 'openai'];

export function Settings({ settings, onSettingsChange, onClose }: SettingsProps) {
    const [draft, setDraft] = useState<AppSettings>(structuredClone(settings));

    const enabledProviders = ALL_PROVIDERS.filter(p => draft.providers[p].enabled);

    const updateProvider = (provider: AIProvider, patch: Partial<AppSettings['providers'][AIProvider]>) => {
        setDraft(prev => ({
            ...prev,
            providers: {
                ...prev.providers,
                [provider]: { ...prev.providers[provider], ...patch },
            },
        }));
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

    return (
        <div className="settings-overlay">
            <div className="settings-modal">
                <div className="settings-header">
                    <h2>Settings</h2>
                    <button className="close-btn" onClick={onClose}>
                        <span className="icon">close</span>
                    </button>
                </div>

                <div className="settings-content">
                    {/* Active Provider Selector */}
                    {enabledProviders.length > 1 && (
                        <div className="setting-group">
                            <label htmlFor="activeProvider">Active Provider</label>
                            <select
                                id="activeProvider"
                                className="select-field"
                                value={draft.activeProvider}
                                onChange={(e) => setDraft(prev => ({ ...prev, activeProvider: e.target.value as AIProvider }))}
                            >
                                {enabledProviders.map(p => (
                                    <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Provider Sections */}
                    {ALL_PROVIDERS.map(provider => {
                        const config = draft.providers[provider];
                        const models = MODEL_OPTIONS[provider];
                        const keyUrl = PROVIDER_KEY_URLS[provider];

                        return (
                            <div key={provider} className={`provider-section ${!config.enabled ? 'provider-disabled' : ''}`}>
                                <div className="provider-header">
                                    <span className="provider-name">{PROVIDER_LABELS[provider]}</span>
                                    <label className="provider-toggle-switch">
                                        <input
                                            type="checkbox"
                                            checked={config.enabled}
                                            onChange={() => handleToggle(provider)}
                                        />
                                        <span className="toggle-slider" />
                                    </label>
                                </div>

                                {config.enabled && (
                                    <div className="provider-fields">
                                        <div className="setting-group">
                                            <label htmlFor={`apiKey-${provider}`}>API Key</label>
                                            <input
                                                id={`apiKey-${provider}`}
                                                type="password"
                                                value={config.apiKey}
                                                onChange={(e) => updateProvider(provider, { apiKey: e.target.value })}
                                                placeholder="Enter your API key..."
                                                className="input-field"
                                            />
                                            <p className="setting-hint">
                                                Get your key from{' '}
                                                <a href={keyUrl.url} target="_blank" rel="noopener noreferrer">
                                                    {keyUrl.label}
                                                </a>
                                            </p>
                                        </div>

                                        <div className="setting-group">
                                            <label htmlFor={`model-${provider}`}>Model</label>
                                            <select
                                                id={`model-${provider}`}
                                                className="select-field"
                                                value={config.model}
                                                onChange={(e) => updateProvider(provider, { model: e.target.value })}
                                            >
                                                {models.map(m => (
                                                    <option key={m.value} value={m.value}>{m.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="settings-footer">
                    <button className="btn-secondary" onClick={onClose}>Cancel</button>
                    <button className="btn-primary" onClick={handleSave} disabled={enabledProviders.length === 0}>
                        Save Settings
                    </button>
                </div>
            </div>
        </div>
    );
}
