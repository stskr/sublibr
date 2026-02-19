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
    // Homepage shortcuts
    onOpenFile?: () => void;
    onNavigateRecentUp?: () => void;
    onNavigateRecentDown?: () => void;
    onSelectRecent?: () => void;
    onSelectTool?: (tool: 'select' | 'scissors' | 'trim') => void;
    onEscape?: () => void;
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

            const isMac = /mac/i.test(navigator.userAgent);
            const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

            // Save: Cmd+S / Ctrl+S (always intercept to prevent browser save)
            if (cmdOrCtrl && e.key.toLowerCase() === 's') {
                e.preventDefault();
                shortcuts.onSave();
                return;
            }

            // Open: Cmd+O / Ctrl+O
            if (cmdOrCtrl && e.key.toLowerCase() === 'o') {
                if (shortcuts.onOpenFile) {
                    e.preventDefault();
                    shortcuts.onOpenFile();
                    return;
                }
            }

            // Escape: Deselect / Blur
            if (e.key === 'Escape') {
                e.preventDefault();
                if (isInput) {
                    target.blur();
                } else if (shortcuts.onEscape) {
                    shortcuts.onEscape();
                }
            }

            // Don't trigger undo/redo or navigation shortcuts while typing in inputs
            if (isInput) return;

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

            // Homepage Navigation: Up/Down Arrows
            if (e.code === 'ArrowUp' && shortcuts.onNavigateRecentUp) {
                e.preventDefault();
                shortcuts.onNavigateRecentUp();
            }
            if (e.code === 'ArrowDown' && shortcuts.onNavigateRecentDown) {
                e.preventDefault();
                shortcuts.onNavigateRecentDown();
            }

            // Select Recent: Enter
            if (e.key === 'Enter' && shortcuts.onSelectRecent) {
                // Only if NOT in an input (already checked by isInput)
                shortcuts.onSelectRecent();
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

            // Tool Shortcuts
            if (!isInput && shortcuts.onSelectTool) {
                if (e.key.toLowerCase() === 'v') shortcuts.onSelectTool('select');
                if (e.key.toLowerCase() === 'c') shortcuts.onSelectTool('scissors');
                if (e.key.toLowerCase() === 't') shortcuts.onSelectTool('trim');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [shortcuts]);
}
