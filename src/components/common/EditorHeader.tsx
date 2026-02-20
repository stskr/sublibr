
export interface EditorHeaderProps {
    showSearch?: boolean;
    onToggleSearch?: () => void;
    autoScroll?: boolean;
    onToggleAutoScroll?: (val: boolean) => void;

    canUndo?: boolean;
    canRedo?: boolean;
    onUndo?: () => void;
    onRedo?: () => void;

    activeStyles: { bold: boolean, italic: boolean, underline: boolean, size: string };
    onApplyStyle: (tag: string) => void;

    entryCount: number;

    // View specific options to disable controls
    hideSearch?: boolean;
    hideAutoScroll?: boolean;
    disableFormatting?: boolean;
}

export function EditorHeader({
    showSearch,
    onToggleSearch,
    autoScroll,
    onToggleAutoScroll,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    activeStyles,
    onApplyStyle,
    entryCount,
    hideSearch = false,
    hideAutoScroll = false,
    disableFormatting = false
}: EditorHeaderProps) {
    return (
        <div className="editor-header">
            <div className="editor-header-left">
                {!hideSearch && (
                    <button
                        className={`btn-icon ${showSearch ? 'active' : ''}`}
                        onClick={onToggleSearch}
                        title="Search and Replace (Cmd/Ctrl+F)"
                    >
                        <span className="icon icon-sm">search</span>
                    </button>
                )}
                {!hideAutoScroll && onToggleAutoScroll && (
                    <label className="auto-scroll-toggle" title="Auto-scroll to active subtitle">
                        <input
                            type="checkbox"
                            checked={autoScroll}
                            onChange={(e) => onToggleAutoScroll(e.target.checked)}
                        />
                        <span className="icon icon-sm">swap_vert</span>
                        Auto-scroll
                    </label>
                )}
            </div>

            <div className="editor-header-center">
                <div className="editor-history-toolbar">
                    <button
                        className="btn-tool-small"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onUndo && onUndo()}
                        title="Undo (Ctrl+Z)"
                        disabled={!canUndo}
                    >
                        <span className="icon icon-sm">undo</span>
                    </button>
                    <button
                        className="btn-tool-small"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onRedo && onRedo()}
                        title="Redo (Ctrl+Shift+Z)"
                        disabled={!canRedo}
                    >
                        <span className="icon icon-sm">redo</span>
                    </button>
                </div>

                <div className="editor-styling-toolbar">
                    <button
                        className={`btn-tool-small ${activeStyles.bold ? 'active' : ''}`}
                        onMouseDown={(e) => { e.preventDefault(); onApplyStyle('b'); }}
                        title="Bold (Ctrl+B)"
                        disabled={disableFormatting}
                    >
                        <span className="icon icon-sm">format_bold</span>
                    </button>
                    <button
                        className={`btn-tool-small ${activeStyles.italic ? 'active' : ''}`}
                        onMouseDown={(e) => { e.preventDefault(); onApplyStyle('i'); }}
                        title="Italic (Ctrl+I)"
                        disabled={disableFormatting}
                    >
                        <span className="icon icon-sm">format_italic</span>
                    </button>
                    <button
                        className={`btn-tool-small ${activeStyles.underline ? 'active' : ''}`}
                        onMouseDown={(e) => { e.preventDefault(); onApplyStyle('u'); }}
                        title="Underline (Ctrl+U)"
                        disabled={disableFormatting}
                    >
                        <span className="icon icon-sm">format_underlined</span>
                    </button>
                </div>
            </div>

            <div className="editor-header-right">
                <span className="subtitle-count">{entryCount} entries</span>
            </div>
        </div>
    );
}
