import { useEffect, useRef } from 'react';
import './ShortcutsModal.css';

interface ShortcutsModalProps {
    onClose: () => void;
    view: 'homepage' | 'editor';
}

export function ShortcutsModal({ onClose, view }: ShortcutsModalProps) {
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

    const groups = [
        {
            id: 'editor',
            title: 'Editor',
            isCurrent: view === 'editor',
            content: (
                <>
                    <div className="shortcut-group-subtitle">Media Control</div>
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

                    <div className="shortcut-group-subtitle">Editing</div>
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
                </>
            )
        },
        {
            id: 'homepage',
            title: 'Homepage',
            isCurrent: view === 'homepage',
            content: (
                <>
                    <div className="shortcut-row">
                        <span className="shortcut-label">Load File</span>
                        <div className="keys">
                            <kbd>{mod}</kbd> + <kbd>O</kbd>
                        </div>
                    </div>
                    <div className="shortcut-row">
                        <span className="shortcut-label">Navigate Recent</span>
                        <div className="keys">
                            <kbd>↑</kbd> / <kbd>↓</kbd>
                        </div>
                    </div>
                    <div className="shortcut-row">
                        <span className="shortcut-label">Select Recent</span>
                        <kbd>Enter</kbd>
                    </div>
                </>
            )
        }
    ];

    // Reorder: current view groups first
    const sortedGroups = [...groups].sort((a, b) => {
        if (a.isCurrent && !b.isCurrent) return -1;
        if (!a.isCurrent && b.isCurrent) return 1;
        return 0;
    });

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
                    {sortedGroups.map(group => (
                        <div key={group.id} className={`shortcut-group ${group.isCurrent ? 'active-group' : ''}`}>
                            <div className="group-header">
                                <h3>{group.title}</h3>
                                {group.isCurrent && (
                                    <span className="current-view-badge">
                                        <span className="icon icon-sm">location_on</span>
                                        You are here
                                    </span>
                                )}
                            </div>
                            {group.content}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
