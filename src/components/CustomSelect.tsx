import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

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
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
    const ref = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLUListElement>(null);

    const selected = options.find(o => o.value === value);

    // Recompute portal position whenever the dropdown opens
    useEffect(() => {
        if (!open || !triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        setDropdownStyle({
            position: 'fixed',
            top: rect.bottom + 4,
            left: rect.left,
            minWidth: rect.width,
            zIndex: 9999,
        });
    }, [open]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                ref.current && !ref.current.contains(target) &&
                dropdownRef.current && !dropdownRef.current.contains(target)
            ) {
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

    const dropdown = open && createPortal(
        <ul ref={dropdownRef} className="custom-select-dropdown" role="listbox" style={dropdownStyle}>
            {options.map(opt => (
                <li
                    key={opt.value}
                    className={`custom-select-option ${opt.value === value ? 'selected' : ''} ${opt.disabled ? 'disabled' : ''}`}
                    role="option"
                    aria-selected={opt.value === value}
                    title={opt.label}
                    onClick={() => {
                        if (opt.disabled) return;
                        onChange(opt.value);
                        setOpen(false);
                    }}
                >
                    {opt.value === value && <span className="icon icon-sm custom-select-check">check</span>}
                    <div className="custom-select-option-wrapper">
                        <span className="custom-select-option-text">{opt.label}</span>
                    </div>
                </li>
            ))}
        </ul>,
        document.body
    );

    return (
        <div
            ref={ref}
            className={`custom-select ${disabled ? 'disabled' : ''} ${className || ''}`}
            style={style}
            id={id}
        >
            <button
                ref={triggerRef}
                type="button"
                className="custom-select-trigger"
                onClick={() => !disabled && setOpen(!open)}
                disabled={disabled}
                role="combobox"
                aria-expanded={open}
                aria-haspopup="listbox"
                title={selected?.label || ''}
            >
                <div className="custom-select-value-wrapper">
                    <span className="custom-select-value">{selected?.label || ''}</span>
                </div>
                <span className={`custom-select-arrow ${open ? 'open' : ''}`} />
            </button>
            {dropdown}
        </div>
    );
}
