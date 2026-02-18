import { useState, useRef, useEffect } from 'react';

interface SelectOption {
    value: string;
    label: string;
    disabled?: boolean;
}

interface CustomSelectProps {
    options: SelectOption[];
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    className?: string;
    style?: React.CSSProperties;
    id?: string;
}

export function CustomSelect({ options, value, onChange, disabled, className, style, id }: CustomSelectProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const selected = options.find(o => o.value === value);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (!open) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { setOpen(false); return; }
            const enabledOptions = options.filter(o => !o.disabled);
            const currentIndex = enabledOptions.findIndex(o => o.value === value);
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const next = enabledOptions[(currentIndex + 1) % enabledOptions.length];
                if (next) { onChange(next.value); }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prev = enabledOptions[(currentIndex - 1 + enabledOptions.length) % enabledOptions.length];
                if (prev) { onChange(prev.value); }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                setOpen(false);
            }
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [open, options, value, onChange]);

    return (
        <div
            ref={ref}
            className={`custom-select ${disabled ? 'disabled' : ''} ${className || ''}`}
            style={style}
            id={id}
        >
            <button
                type="button"
                className="custom-select-trigger"
                onClick={() => !disabled && setOpen(!open)}
                disabled={disabled}
                role="combobox"
                aria-expanded={open}
                aria-haspopup="listbox"
            >
                <span className="custom-select-value">{selected?.label || ''}</span>
                <span className={`custom-select-arrow ${open ? 'open' : ''}`} />
            </button>
            {open && (
                <ul className="custom-select-dropdown" role="listbox">
                    {options.map(opt => (
                        <li
                            key={opt.value}
                            className={`custom-select-option ${opt.value === value ? 'selected' : ''} ${opt.disabled ? 'disabled' : ''}`}
                            role="option"
                            aria-selected={opt.value === value}
                            onClick={() => {
                                if (opt.disabled) return;
                                onChange(opt.value);
                                setOpen(false);
                            }}
                        >
                            {opt.value === value && <span className="icon icon-sm custom-select-check">check</span>}
                            {opt.label}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
