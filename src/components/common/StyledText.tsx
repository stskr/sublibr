import React from 'react';

interface StyledTextProps {
    text: string;
    className?: string;
}

/**
 * Parses and renders subtitle text with support for:
 * - <i>...</i> or {i}...{/i} (Italics)
 * - <b>...</b> or {b}...{/b} (Bold)
 * - <u>...</u> or {u}...{/u} (Underline)
 * - <font color="..." size="...">...</font> (Color & Size)
 */
export const StyledText: React.FC<StyledTextProps> = ({ text, className }) => {
    if (!text) return null;

    // Replace curly brace variants with HTML-like tags for easier uniform parsing
    const processedText = text
        .replace(/\{i\}/gi, '<i>')
        .replace(/\{\/i\}/gi, '</i>')
        .replace(/\{b\}/gi, '<b>')
        .replace(/\{\/b\}/gi, '</b>')
        .replace(/\{u\}/gi, '<u>')
        .replace(/\{\/u\}/gi, '</u>');

    // Simple parser that handles nested basic tags and <font>
    // We'll use a recursive approach or a simple regex-tokenized loop.
    // For safety and performance, we'll build React elements.

    const parseText = (input: string): React.ReactNode[] => {
        const result: React.ReactNode[] = [];
        // Regex to match our supported tags
        // 1: tag name, 2: attributes (for font), 3: inner text
        const tagRegex = /<(i|b|u|font)([^>]*)>(.*?)<\/\1>/gi;

        let lastIndex = 0;
        let match;

        while ((match = tagRegex.exec(input)) !== null) {
            // Add text before the match
            if (match.index > lastIndex) {
                result.push(input.substring(lastIndex, match.index));
            }

            const tagName = match[1].toLowerCase();
            const attrs = match[2];
            const content = match[3];

            if (tagName === 'i') {
                result.push(<i key={match.index}>{parseText(content)}</i>);
            } else if (tagName === 'b') {
                result.push(<b key={match.index}>{parseText(content)}</b>);
            } else if (tagName === 'u') {
                result.push(<u key={match.index}>{parseText(content)}</u>);
            } else if (tagName === 'font') {
                const colorMatch = attrs.match(/color=["']([^"']+)["']/i);
                const sizeMatch = attrs.match(/size=["']([^"']+)["']/i);
                const style: React.CSSProperties = {};
                if (colorMatch) style.color = colorMatch[1];
                if (sizeMatch) {
                    // Size in subtitles usually means 1-7 or similar relative values
                    // We'll map them to scale factors
                    const size = parseInt(sizeMatch[1]);
                    if (!isNaN(size)) {
                        style.fontSize = `${0.5 + (size * 0.2)}em`;
                    }
                }
                result.push(<span key={match.index} style={style}>{parseText(content)}</span>);
            }

            lastIndex = tagRegex.lastIndex;
        }

        // Add remaining text
        if (lastIndex < input.length) {
            result.push(input.substring(lastIndex));
        }

        return result.length > 0 ? result : [input];
    };

    return <span className={className}>{parseText(processedText)}</span>;
};
