import { useState, useEffect } from 'react';
import { LANGUAGES } from '../utils';
import type { AppSettings } from '../types';

interface SettingsProps {
    settings: AppSettings;
    onSettingsChange: (settings: AppSettings) => void;
    onClose: () => void;
}

export function Settings({ settings, onSettingsChange, onClose }: SettingsProps) {
    const [apiKey, setApiKey] = useState(settings.apiKey);
    const [model, setModel] = useState(settings.model);
    const [language, setLanguage] = useState(settings.language);
    const [autoDetect, setAutoDetect] = useState(settings.autoDetectLanguage);
    const [languageSearch, setLanguageSearch] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);

    const filteredLanguages = LANGUAGES.filter(lang =>
        lang.toLowerCase().includes(languageSearch.toLowerCase())
    );

    useEffect(() => {
        if (language) {
            setLanguageSearch(language);
        }
    }, [language]);

    const handleSave = () => {
        onSettingsChange({
            apiKey,
            model,
            language,
            autoDetectLanguage: autoDetect,
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

                    <div className="setting-group">
                        <label>Language</label>
                        <div className="language-toggle">
                            <button
                                className={`toggle-btn ${!autoDetect ? 'active' : ''}`}
                                onClick={() => setAutoDetect(false)}
                            >
                                Select Language
                            </button>
                            <button
                                className={`toggle-btn ${autoDetect ? 'active' : ''}`}
                                onClick={() => setAutoDetect(true)}
                            >
                                Auto-detect
                            </button>
                        </div>

                        {!autoDetect && (
                            <div className="language-select">
                                <input
                                    type="text"
                                    value={languageSearch}
                                    onChange={(e) => {
                                        setLanguageSearch(e.target.value);
                                        setShowDropdown(true);
                                    }}
                                    onFocus={() => setShowDropdown(true)}
                                    onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                                    placeholder="Type to search languages..."
                                    className="input-field"
                                />
                                {showDropdown && filteredLanguages.length > 0 && (
                                    <ul className="language-dropdown">
                                        {filteredLanguages.slice(0, 8).map((lang) => (
                                            <li
                                                key={lang}
                                                onClick={() => {
                                                    setLanguage(lang);
                                                    setLanguageSearch(lang);
                                                    setShowDropdown(false);
                                                }}
                                                className={language === lang ? 'selected' : ''}
                                            >
                                                {lang}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
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
