import { useEffect } from 'react';

interface Shortcuts {
    onUndo: () => void;
    onRedo: () => void;
    onSave: () => void; // Ctrl+S/Cmd+S
    onPlayPause: () => void;
    onSeekBackward: () => void;
    onSeekForward: () => void;
    onInsertSubtitle: () => void;
    onDeleteSubtitle: () => void;
}

export function useKeyboardShortcuts(shortcuts: Shortcuts) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Check if focus is in an input or textarea
            const target = e.target as HTMLElement;
            const isInput =
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable;

            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

            // Undo: Cmd+Z / Ctrl+Z
            if (cmdOrCtrl && !e.shiftKey && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                shortcuts.onUndo();
                return;
            }

            // Redo: Cmd+Shift+Z / Ctrl+Shift+Z / Ctrl+Y
            if ((cmdOrCtrl && e.shiftKey && e.key.toLowerCase() === 'z') || (cmdOrCtrl && e.key.toLowerCase() === 'y')) {
                e.preventDefault();
                shortcuts.onRedo();
                return;
            }

            // Save: Cmd+S / Ctrl+S (Prevent browser save)
            if (cmdOrCtrl && e.key.toLowerCase() === 's') {
                e.preventDefault();
                shortcuts.onSave();
                return;
            }

            // GLOBAL NAVIGATION SHORTCUTS
            // (Should work unless user is typing in a text field)

            if (isInput) return; // Don't trigger navigation shortcuts while typing

            // Play/Pause: Space
            if (e.code === 'Space') {
                e.preventDefault();
                shortcuts.onPlayPause();
            }

            // Seek: Left/Right Arrows
            if (e.code === 'ArrowLeft') {
                e.preventDefault();
                shortcuts.onSeekBackward();
            }
            if (e.code === 'ArrowRight') {
                e.preventDefault();
                shortcuts.onSeekForward();
            }

            // Insert New: Alt+N
            if (e.altKey && e.key.toLowerCase() === 'n') {
                e.preventDefault();
                shortcuts.onInsertSubtitle();
            }

            // Delete: Alt+Backspace / Alt+Delete
            if (e.altKey && (e.key === 'Backspace' || e.key === 'Delete')) {
                e.preventDefault();
                shortcuts.onDeleteSubtitle();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [shortcuts]);
}
