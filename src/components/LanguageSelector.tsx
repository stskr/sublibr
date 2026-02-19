import { useState, useEffect } from 'react';
import { LANGUAGES } from '../utils';

interface LanguageSelectorProps {
    language: string;
    autoDetect: boolean;
    onLanguageChange: (language: string, autoDetect: boolean) => void;
}

export function LanguageSelector({ language, autoDetect, onLanguageChange }: LanguageSelectorProps) {
    const [searchTerm, setSearchTerm] = useState(language);
    const [showDropdown, setShowDropdown] = useState(false);

    // Sync search term when external language prop changes (e.g. from settings load)
    useEffect(() => {
        if (!showDropdown) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSearchTerm(language);
        }
    }, [language, showDropdown]);

    const filteredLanguages = LANGUAGES.filter(lang =>
        lang.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSelect = (lang: string) => {
        onLanguageChange(lang, false);
        setSearchTerm(lang);
        setShowDropdown(false);
    };

    const handleBlur = () => {
        // Delay hiding dropdown to allow click event to register
        setTimeout(() => {
            setShowDropdown(false);
            // Revert input to actual selected language if no new selection was made
            setSearchTerm(language);
        }, 200);
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
                    onClick={() => {
                        onLanguageChange(language, false);
                        setSearchTerm(language);
                    }}
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
                        value={searchTerm}
                        onChange={(e) => {
                            setSearchTerm(e.target.value);
                            setShowDropdown(true);
                        }}
                        onFocus={() => {
                            setSearchTerm(''); // Clear on focus to show all options? Or keep current? 
                            // Better UX: keep current, let user delete if they want.
                            // Actually, let's keep current behavior but select all text if possible? 
                            // For now, just show dropdown. 
                            setShowDropdown(true);
                        }}
                        onBlur={handleBlur}
                        placeholder="Search languages..."
                    />
                    {showDropdown && filteredLanguages.length > 0 && (
                        <ul className="language-dropdown">
                            {filteredLanguages.slice(0, 8).map(lang => (
                                <li
                                    key={lang}
                                    onMouseDown={() => handleSelect(lang)} // Use onMouseDown to fire before onBlur
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
