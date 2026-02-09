import { useState } from 'react';
import type { AppSettings } from '../types';

interface SettingsProps {
    settings: AppSettings;
    onSettingsChange: (settings: AppSettings) => void;
    onClose: () => void;
}

export function Settings({ settings, onSettingsChange, onClose }: SettingsProps) {
    const [apiKey, setApiKey] = useState(settings.apiKey);
    const [model, setModel] = useState(settings.model);

    const handleSave = () => {
        onSettingsChange({
            ...settings,
            apiKey,
            model,
        });
        onClose();
    };

    return (
        <div className="settings-overlay">
            <div className="settings-modal">
                <div className="settings-header">
                    <h2>Settings</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <div className="settings-content">
                    <div className="setting-group">
                        <label htmlFor="apiKey">Google AI Studio API Key</label>
                        <input
                            id="apiKey"
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="Enter your API key..."
                            className="input-field"
                        />
                        <p className="setting-hint">
                            Get your API key from{' '}
                            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">
                                Google AI Studio
                            </a>
                        </p>
                    </div>

                    <div className="setting-group">
                        <label htmlFor="model">Gemini Model</label>
                        <select
                            id="model"
                            value={model}
                            onChange={(e) => setModel(e.target.value as AppSettings['model'])}
                            className="select-field"
                        >
                            <option value="gemini-1.5-flash">Gemini 1.5 Flash (Faster, Cheaper)</option>
                            <option value="gemini-1.5-pro">Gemini 1.5 Pro (More Accurate)</option>
                        </select>
                    </div>
                </div>

                <div className="settings-footer">
                    <button className="btn-secondary" onClick={onClose}>Cancel</button>
                    <button className="btn-primary" onClick={handleSave}>Save Settings</button>
                </div>
            </div>
        </div>
    );
}
