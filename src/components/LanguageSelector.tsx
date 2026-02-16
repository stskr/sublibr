import { useState } from 'react';
import { LANGUAGES } from '../utils';

interface LanguageSelectorProps {
    language: string;
    autoDetect: boolean;
    onLanguageChange: (language: string, autoDetect: boolean) => void;
}

export function LanguageSelector({ language, autoDetect, onLanguageChange }: LanguageSelectorProps) {
    const [languageSearch, setLanguageSearch] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);

    const filteredLanguages = LANGUAGES.filter(lang =>
        lang.toLowerCase().includes(languageSearch.toLowerCase())
    );

    const handleSelect = (lang: string) => {
        onLanguageChange(lang, false);
        setLanguageSearch('');
        setShowDropdown(false);
    };

    return (
        <div className="language-selection-inline">
            <label>Language</label>
            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '8px', lineHeight: '1.4' }}>
                Choose the source language or select Auto-Detect
            </p>
            <div className="language-toggle">
                <button
                    className={`toggle-btn ${!autoDetect ? 'active' : ''}`}
                    onClick={() => onLanguageChange(language, false)}
                >
                    Select Language
                </button>
                <button
                    className={`toggle-btn ${autoDetect ? 'active' : ''}`}
                    onClick={() => onLanguageChange(language, true)}
                >
                    Auto-detect
                </button>
            </div>
            {autoDetect && (
                <div style={{
                    marginTop: '8px',
                    padding: '8px 12px',
                    background: 'rgba(224, 235, 117, 0.1)',
                    border: '1px solid var(--color-warning)',
                    borderRadius: '6px',
                    color: 'var(--color-warning)',
                    fontSize: '12px'
                }}>
                    Auto-detect may be less accurate. Select a specific language for best results.
                </div>
            )}
            {!autoDetect && (
                <div className="language-autocomplete">
                    <input
                        type="text"
                        value={languageSearch || language}
                        onChange={(e) => {
                            setLanguageSearch(e.target.value);
                            setShowDropdown(true);
                        }}
                        onFocus={() => setShowDropdown(true)}
                        onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                        placeholder="Search languages..."
                    />
                    {showDropdown && filteredLanguages.length > 0 && (
                        <ul className="language-dropdown">
                            {filteredLanguages.slice(0, 8).map(lang => (
                                <li
                                    key={lang}
                                    onClick={() => handleSelect(lang)}
                                    className={lang === language ? 'selected' : ''}
                                >
                                    {lang}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
