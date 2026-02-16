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

    const checkModels = async () => {
        if (!apiKey) return;
        try {
            // @ts-ignore - listModels might not be in the type definition yet or accessed differently
            // Actually, currently GoogleGenerativeAI doesn't expose listModels directly on the main class in some versions.
            // We might need to fetch it manually via fetch if the SDK doesn't support it directly yet or use the model manager.
            // Let's try a direct fetch to be sure.
            const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
                headers: { 'x-goog-api-key': apiKey },
            });
            const data = await response.json();
            console.log('Available Models:', data);
            alert('Models listed in console (Developer Tools)');
        } catch (error) {
            console.error('Failed to list models:', error);
            alert('Failed to list models. See console.');
        }
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
                            <option value="gemini-2.5-flash">Gemini 2.5 Flash (Latest, Fast)</option>
                            <option value="gemini-2.5-pro">Gemini 2.5 Pro (Latest, Powerful)</option>
                        </select>
                        <button type="button" onClick={checkModels} className="text-xs text-blue-400 mt-2 underline cursor-pointer" style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-accent)' }}>
                            Check Available Models (Debug)
                        </button>
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
