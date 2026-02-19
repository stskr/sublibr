import React, { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { detectDirection } from '../../utils';

interface RichTextEditorProps {
    value: string;
    onChange: (value: string) => void;
    onBlur?: (e: React.FocusEvent) => void;
    onStatusChange?: (status: { bold: boolean; italic: boolean; underline: boolean; color: string; size: string }) => void;
    placeholder?: string;
    className?: string;
    autoFocus?: boolean;
    onKeyDown?: (e: React.KeyboardEvent) => void;
}

export interface RichTextEditorRef {
    execCommand: (command: string, value?: string) => void;
    focus: () => void;
    saveSelection: () => void;
    restoreSelection: () => void;
}

/**
 * Utility to convert subtitle tags to HTML for contenteditable
 */
const tagsToHtml = (text: string): string => {
    return text
        .replace(/<b>/gi, '<strong>').replace(/<\/b>/gi, '</strong>')
        .replace(/<i>/gi, '<em>').replace(/<\/i>/gi, '</em>')
        .replace(/<u>/gi, '<u>').replace(/<\/u>/gi, '</u>')
        .replace(/{b}/gi, '<strong>').replace(/{\/b}/gi, '</strong>')
        .replace(/{i}/gi, '<em>').replace(/{\/i}/gi, '</em>')
        .replace(/{u}/gi, '<u>').replace(/{\/u}/gi, '</u>')
        .replace(/<font color="([^"]+)">/gi, '<span style="color:$1">')
        .replace(/<font size="([^"]+)">/gi, '<span style="font-size:$1">') // Note: simple mapping, size is tricky in HTML
        .replace(/<\/font>/gi, '</span>')
        .replace(/\n/g, '<br>');
};

/**
 * Utility to convert HTML back to subtitle tags
 */
const htmlToTags = (html: string): string => {
    const div = document.createElement('div');
    div.innerHTML = html;

    // Recursive helper to process nodes
    const processNode = (node: Node): string => {
        if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent || '';
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return '';

        const el = node as HTMLElement;
        let content = Array.from(el.childNodes).map(processNode).join('');

        switch (el.tagName.toLowerCase()) {
            case 'strong':
            case 'b':
                return `<b>${content}</b>`;
            case 'em':
            case 'i':
                return `<i>${content}</i>`;
            case 'u':
                return `<u>${content}</u>`;
            case 'font':
                // Handle legacy font tags often produced by execCommand
                const colorAttr = el.getAttribute('color');
                const sizeAttr = el.getAttribute('size');
                if (colorAttr) return `<font color="${colorAttr}">${content}</font>`;
                if (sizeAttr) return `<font size="${sizeAttr}">${content}</font>`;
                return content;
            case 'span':
                const color = el.style.color;
                const fontSize = el.style.fontSize;
                // Convert complex colors to hex if needed, but execCommand might output hex or rgb
                // Ideally we stick to what the browser gives 
                if (color) return `<font color="${color}">${content}</font>`;
                if (fontSize) return `<font size="${fontSize}">${content}</font>`;
                return content;
            case 'br':
                return '\n';
            case 'div':
            case 'p':
                return (content ? content + '\n' : '');
            default:
                return content;
        }
    };

    return Array.from(div.childNodes).map(processNode).join('').trim();
};

export const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(({
    value,
    onChange,
    onBlur,
    onStatusChange,
    placeholder,
    className,
    autoFocus,
    onKeyDown
}, ref) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const lastValueRef = useRef<string | null>(null);
    const savedSelection = useRef<Range | null>(null);

    // Expose methods to parent
    useImperativeHandle(ref, () => ({
        execCommand: (command: string, val: string = '') => {
            document.execCommand(command, false, val);
            handleInput();
        },
        focus: () => {
            editorRef.current?.focus();
        },
        saveSelection: () => {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                // Ensure the selection is within our editor
                let node = sel.anchorNode;
                while (node) {
                    if (node === editorRef.current) {
                        savedSelection.current = sel.getRangeAt(0).cloneRange();
                        return;
                    }
                    node = node.parentNode;
                }
            }
        },
        restoreSelection: () => {
            if (savedSelection.current && editorRef.current) {
                editorRef.current.focus();
                const sel = window.getSelection();
                if (sel) {
                    sel.removeAllRanges();
                    sel.addRange(savedSelection.current);
                }
            }
        }
    }));

    // Update internal HTML when value prop changes (from outside)
    useEffect(() => {
        if (!editorRef.current) return;

        // If the incoming value is what we just set or matches the current HTML, skip
        if (value === lastValueRef.current) return;

        const currentTaggedValue = htmlToTags(editorRef.current.innerHTML);
        if (currentTaggedValue === value) {
            lastValueRef.current = value;
            return;
        }

        const htmlValue = tagsToHtml(value);
        if (editorRef.current.innerHTML !== htmlValue) {
            editorRef.current.innerHTML = htmlValue;
            lastValueRef.current = value;
        }
    }, [value]);

    const handleInput = () => {
        if (!editorRef.current) return;
        const html = editorRef.current.innerHTML;
        const taggedValue = htmlToTags(html);
        lastValueRef.current = taggedValue;
        onChange(taggedValue);
        updateStatus();
    };

    const updateStatus = useCallback(() => {
        if (!onStatusChange) return;
        onStatusChange({
            bold: document.queryCommandState('bold'),
            italic: document.queryCommandState('italic'),
            underline: document.queryCommandState('underline'),
            color: document.queryCommandValue('foreColor'),
            size: document.queryCommandValue('fontSize')
        });
    }, [onStatusChange]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        updateStatus();
        if (onKeyDown) onKeyDown(e);
    };

    const handleMouseUp = () => {
        updateStatus();
    };

    useEffect(() => {
        if (autoFocus && editorRef.current) {
            editorRef.current.focus();
            // Move cursor to end
            const range = document.createRange();
            range.selectNodeContents(editorRef.current);
            range.collapse(false);
            const selection = window.getSelection();
            if (selection) {
                selection.removeAllRanges();
                selection.addRange(range);
            }
        }
    }, [autoFocus]);

    const direction = detectDirection(value);

    return (
        <div
            ref={editorRef}
            contentEditable
            className={`rich-text-editor ${className || ''}`}
            onInput={handleInput}
            onBlur={onBlur}
            onKeyDown={handleKeyDown}
            onMouseUp={handleMouseUp}
            dir={direction}
            style={{
                direction: direction as any,
                minHeight: '1em',
                outline: 'none',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                cursor: 'text'
            }}
            data-placeholder={placeholder}
        />
    );
});

RichTextEditor.displayName = 'RichTextEditor';
