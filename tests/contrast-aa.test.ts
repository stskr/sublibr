import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function hexToRgb(hex: string): [number, number, number] {
    const raw = hex.replace('#', '').trim();
    const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
    const n = parseInt(full, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function linearize(channel: number): number {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
    const [r, g, b] = hexToRgb(hex);
    return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function contrast(a: string, b: string): number {
    const L1 = luminance(a);
    const L2 = luminance(b);
    const [hi, lo] = L1 >= L2 ? [L1, L2] : [L2, L1];
    return (hi + 0.05) / (lo + 0.05);
}

function readTokens(): Record<string, string> {
    const css = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8');
    const block = css.match(/:root\s*\{([\s\S]*?)\n\}/);
    if (!block) throw new Error('Could not find :root in App.css');
    const tokens: Record<string, string> = {};
    for (const match of block[1].matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8});/g)) {
        tokens[match[1]] = match[2];
    }
    return tokens;
}

const AA_TEXT = 4.5;
const AA_UI = 3;

describe('WCAG AA contrast tokens', () => {
    const t = readTokens();
    const surfaces = [
        t['color-bg-primary'],
        t['color-bg-secondary'],
        t['color-bg-tertiary'],
        t['color-bg-hover'],
        t['color-bg-active'],
    ];

    it('body and muted text meet 4.5:1 on every surface', () => {
        for (const bg of surfaces) {
            expect(contrast(t['color-text-primary'], bg)).toBeGreaterThanOrEqual(AA_TEXT);
            expect(contrast(t['color-text-secondary'], bg)).toBeGreaterThanOrEqual(AA_TEXT);
            expect(contrast(t['color-text-muted'], bg)).toBeGreaterThanOrEqual(AA_TEXT);
            expect(contrast(t['color-accent-text'], bg)).toBeGreaterThanOrEqual(AA_TEXT);
            expect(contrast(t['color-accent-text-hover'], bg)).toBeGreaterThanOrEqual(AA_TEXT);
            expect(contrast(t['color-error'], bg)).toBeGreaterThanOrEqual(AA_TEXT);
            expect(contrast(t['color-success'], bg)).toBeGreaterThanOrEqual(AA_TEXT);
            expect(contrast(t['color-warning'], bg)).toBeGreaterThanOrEqual(AA_TEXT);
        }
    });

    it('white labels on accent fills meet 4.5:1', () => {
        expect(contrast(t['color-on-accent'], t['color-accent'])).toBeGreaterThanOrEqual(AA_TEXT);
        expect(contrast(t['color-on-accent'], t['color-accent-hover'])).toBeGreaterThanOrEqual(AA_TEXT);
    });

    it('danger button text meets 4.5:1 on the error fill', () => {
        expect(contrast(t['color-on-error'], t['color-error'])).toBeGreaterThanOrEqual(AA_TEXT);
    });

    it('control borders meet 3:1 on every surface', () => {
        for (const bg of surfaces) {
            expect(contrast(t['color-border'], bg)).toBeGreaterThanOrEqual(AA_UI);
            expect(contrast(t['color-border-focus'], bg)).toBeGreaterThanOrEqual(AA_UI);
        }
    });
});
