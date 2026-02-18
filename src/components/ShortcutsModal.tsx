import { useEffect, useRef } from 'react';
import './ShortcutsModal.css';

interface ShortcutsModalProps {
    onClose: () => void;
}

export function ShortcutsModal({ onClose }: ShortcutsModalProps) {
    const mod = /mac/i.test(navigator.userAgent) ? '⌘' : 'Ctrl';

    const modalRef = useRef<HTMLDivElement>(null);

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
        <div className="modal-backdrop" onClick={onClose}>
            <div
                className="modal-content shortcuts-modal"
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="shortcuts-title"
                ref={modalRef}
                tabIndex={-1}
            >
                <div className="modal-header">
                    <h2 id="shortcuts-title">Keyboard Shortcuts</h2>
                    <button className="btn-icon" onClick={onClose} aria-label="Close shortcuts">
                        <span className="icon">close</span>
                    </button>
                </div>
                <div className="modal-body">
                    <div className="shortcut-group">
                        <h3>Media Control</h3>
                        <div className="shortcut-row">
                            <span className="shortcut-label">Play / Pause</span>
                            <kbd>Space</kbd>
                        </div>
                        <div className="shortcut-row">
                            <span className="shortcut-label">Seek Backward 5s</span>
                            <kbd>←</kbd>
                        </div>
                        <div className="shortcut-row">
                            <span className="shortcut-label">Seek Forward 5s</span>
                            <kbd>→</kbd>
                        </div>
                    </div>

                    <div className="shortcut-group">
                        <h3>Editing</h3>
                        <div className="shortcut-row">
                            <span className="shortcut-label">Undo</span>
                            <div className="keys">
                                <kbd>{mod}</kbd> + <kbd>Z</kbd>
                            </div>
                        </div>
                        <div className="shortcut-row">
                            <span className="shortcut-label">Redo</span>
                            <div className="keys">
                                <kbd>{mod}</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd>
                            </div>
                        </div>
                        <div className="shortcut-row">
                            <span className="shortcut-label">Insert Subtitle</span>
                            <div className="keys">
                                <kbd>Alt</kbd> + <kbd>N</kbd>
                            </div>
                        </div>
                        <div className="shortcut-row">
                            <span className="shortcut-label">Delete Subtitle</span>
                            <div className="keys">
                                <kbd>Alt</kbd> + <kbd>Del</kbd>
                            </div>
                        </div>
                        <div className="shortcut-row">
                            <span className="shortcut-label">Save / Download</span>
                            <div className="keys">
                                <kbd>{mod}</kbd> + <kbd>S</kbd>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
