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
