import { describe, it, expect } from 'vitest';
import { layoutCueText, layoutSubtitles, reflowSubtitles, tokenize, LAYOUT, layoutLimits } from '../src/services/subtitleLayout';
import type { Subtitle } from '../src/types';

function cue(text: string): Subtitle {
    return { id: 'a', index: 1, startTime: 0, endTime: 4, text };
}

describe('layoutCueText', () => {
    it('keeps a short cue on one line', () => {
        expect(layoutCueText('Take a breath')).toBe('Take a breath');
    });

    it('never produces more than two lines', () => {
        const words = Array.from({ length: 14 }, (_, i) => `w${i + 1}`);
        const lines = layoutCueText(words.join(' ')).split('\n');
        expect(lines.length).toBeLessThanOrEqual(LAYOUT.maxLines);
        for (const line of lines) {
            expect(tokenize(line).length).toBeLessThanOrEqual(LAYOUT.maxWordsPerLine);
        }
    });

    it('collapses three authored lines into at most two', () => {
        const text = 'first line here\nsecond line is longer than the first\nand a leftover';
        const lines = layoutCueText(text).split('\n');
        expect(lines.length).toBeLessThanOrEqual(2);
        expect(Math.min(...lines.map(l => tokenize(l).length))).toBeGreaterThanOrEqual(2);
    });

    it('does not leave a 1–2 word tail under a long line', () => {
        const text = 'one two three four five six seven eight nine';
        const lines = layoutCueText(text).split('\n');
        expect(lines.length).toBe(2);
        const counts = lines.map(l => tokenize(l).length);
        expect(Math.abs(counts[0] - counts[1])).toBeLessThanOrEqual(2);
        expect(Math.min(...counts)).toBeGreaterThanOrEqual(3);
    });
});

describe('layoutSubtitles', () => {
    it('splits an oversized cue into timed pieces', () => {
        const words = Array.from({ length: 28 }, (_, i) => `word${i}`);
        const result = layoutSubtitles([cue(words.join(' '))]);
        expect(result.length).toBeGreaterThan(1);
        expect(result[0].startTime).toBe(0);
        expect(result[result.length - 1].endTime).toBe(4);
        for (const sub of result) {
            expect(sub.text.split('\n').length).toBeLessThanOrEqual(2);
        }
    });

    it('uses shorter lines on 9:16 than on 16:9', () => {
        const text = 'אתם יכולים להירגע! לנו, בחברת החשמל, אכפת מכם ומאיכות הסביבה';
        const vertical = layoutSubtitles([cue(text)], 'vertical');
        const wide = layoutSubtitles([cue(text)], 'wide');
        const longest = (subs: Subtitle[]) =>
            Math.max(...subs.flatMap(s => s.text.split('\n').map(l => l.length)));
        expect(layoutLimits(text, 'vertical').maxCharsPerLine).toBeLessThan(layoutLimits(text, 'wide').maxCharsPerLine);
        expect(longest(vertical)).toBeLessThanOrEqual(layoutLimits(text, 'vertical').maxCharsPerLine + 8);
        expect(longest(vertical)).toBeLessThanOrEqual(longest(wide));
        for (const sub of [...vertical, ...wide]) {
            const lines = sub.text.split('\n');
            expect(lines.length).toBeLessThanOrEqual(2);
            if (lines.length === 2) {
                const counts = lines.map(l => tokenize(l).length);
                expect(Math.min(...counts)).toBeGreaterThanOrEqual(2);
            }
        }
    });
});

describe('reflowSubtitles', () => {
    it('re-wraps the same speech when switching from wide to vertical', () => {
        const source = layoutSubtitles([
            cue('לכן, אנחנו ממשיכים להרחיב את היקף השימוש בגז הטבעי בייצור החשמל כדי שהילדים שלנו'),
        ], 'wide');
        const vertical = reflowSubtitles(source, 'vertical');
        const longest = (subs: Subtitle[]) =>
            Math.max(...subs.flatMap(s => s.text.split('\n').map(l => l.length)));
        expect(longest(vertical)).toBeLessThanOrEqual(layoutLimits(source[0].text, 'vertical').maxCharsPerLine + 8);
        expect(vertical.every(s => s.text.split('\n').length <= 2)).toBe(true);
    });
});
