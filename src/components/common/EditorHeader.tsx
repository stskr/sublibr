import React from 'react';

export interface EditorHeaderProps {
    showSearch?: boolean;
    onToggleSearch?: () => void;
    autoScroll?: boolean;
    onToggleAutoScroll?: (val: boolean) => void;

    canUndo?: boolean;
    canRedo?: boolean;
    onUndo?: () => void;
    onRedo?: () => void;

    activeStyles: { bold: boolean, italic: boolean, underline: boolean, color: string, size: string };
    onApplyStyle: (tag: string) => void;

    colorInputRef?: React.RefObject<HTMLInputElement | null>;
    onColorClick?: () => void;
    onColorChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;

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
    colorInputRef,
    onColorClick,
    onColorChange,
    entryCount,
    hideSearch = false,
    hideAutoScroll = false,
    disableFormatting = false
}: EditorHeaderProps) {
    return (
        <div className="editor-header">
            <div className="editor-header-actions">
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

            <div className="editor-toolbars">
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
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                        <button
                            className="btn-tool-small"
                            onMouseDown={(e) => { e.preventDefault(); onApplyStyle('font'); }}
                            title="Color"
                            disabled={disableFormatting}
                        >
                            <span className="icon icon-sm">palette</span>
                        </button>
                        {colorInputRef && (
                            <input
                                type="color"
                                ref={colorInputRef}
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: '100%',
                                    opacity: 0,
                                    cursor: disableFormatting ? 'default' : 'pointer'
                                }}
                                onMouseDown={(e) => {
                                    if (disableFormatting) e.preventDefault();
                                    else if (onColorClick) onColorClick();
                                }}
                                onChange={onColorChange}
                                disabled={disableFormatting}
                            />
                        )}
                    </div>
                </div>

                <span className="subtitle-count">{entryCount} entries</span>
            </div>
        </div>
    );
}
