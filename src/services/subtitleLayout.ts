import type { ScreenSize, Subtitle } from '../types';
import { generateId, applyRtlTypography } from '../utils';

export type LayoutLimits = {
    maxLines: 2;
    maxWordsPerLine: number;
    maxWordsPerCue: number;
    maxCharsPerLine: number;
};

/** Fallback used when no frame is known (16:9 Latin). */
export const LAYOUT: LayoutLimits = {
    maxLines: 2,
    maxWordsPerLine: 9,
    maxWordsPerCue: 16,
    maxCharsPerLine: 37,
};

const RTL_LETTER = /[\u0590-\u05FF\u0600-\u06FF]/;

export function tokenize(text: string): string[] {
    return stripMarkup(text).replace(/\r/g, '').replace(/\n+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function stripMarkup(text: string): string {
    return text.replace(/<[^>]+>/g, ' ').replace(/\{[^}]+\}/g, ' ');
}

export function isRtlScript(text: string): boolean {
    const letters = text.replace(/[^\p{L}]/gu, '');
    if (!letters) return false;
    const rtl = [...letters].filter(c => RTL_LETTER.test(c)).length;
    return rtl > letters.length / 2;
}

export function frameAspect(
    screen: ScreenSize,
    mediaW?: number,
    mediaH?: number,
): 'wide' | 'square' | 'vertical' {
    if (screen === 'wide' || screen === 'square' || screen === 'vertical') return screen;
    if (mediaW && mediaH) {
        const r = mediaW / mediaH;
        if (r < 0.8) return 'vertical';
        if (r < 1.2) return 'square';
        return 'wide';
    }
    return 'wide';
}

/** Line budget for this cue on this output frame. Narrower frames get shorter lines. */
export function layoutLimits(
    text: string,
    screen: ScreenSize = 'wide',
    mediaW?: number,
    mediaH?: number,
): LayoutLimits {
    const aspect = frameAspect(screen, mediaW, mediaH);
    const rtl = isRtlScript(text);
    if (rtl) {
        switch (aspect) {
            case 'vertical':
                return { maxLines: 2, maxWordsPerLine: 5, maxWordsPerCue: 10, maxCharsPerLine: 18 };
            case 'square':
                return { maxLines: 2, maxWordsPerLine: 6, maxWordsPerCue: 12, maxCharsPerLine: 22 };
            default:
                return { maxLines: 2, maxWordsPerLine: 7, maxWordsPerCue: 14, maxCharsPerLine: 26 };
        }
    }
    switch (aspect) {
        case 'vertical':
            return { maxLines: 2, maxWordsPerLine: 5, maxWordsPerCue: 10, maxCharsPerLine: 22 };
        case 'square':
            return { maxLines: 2, maxWordsPerLine: 7, maxWordsPerCue: 14, maxCharsPerLine: 28 };
        default:
            return LAYOUT;
    }
}

function fitsOneLine(words: string[], limits: LayoutLimits): boolean {
    if (words.length === 0) return true;
    if (words.length > limits.maxWordsPerLine) return false;
    return words.join(' ').length <= limits.maxCharsPerLine;
}

function endsSentence(word: string): boolean {
    return /[.!?…؟]$/.test(word);
}

function unbalanced(left: string[], right: string[]): boolean {
    const minW = Math.min(left.length, right.length);
    const maxW = Math.max(left.length, right.length);
    if (minW <= 2 && maxW >= 5) return true;
    const minC = Math.min(left.join(' ').length, right.join(' ').length);
    const maxC = Math.max(left.join(' ').length, right.join(' ').length);
    return minC > 0 && maxC / minC > 2.1;
}

function bestSplitIndex(words: string[], limits: LayoutLimits): number {
    const n = words.length;
    let best = Math.ceil(n / 2);
    let bestScore = Infinity;

    for (let i = 1; i < n; i++) {
        const left = words.slice(0, i);
        const right = words.slice(i);
        const leftStr = left.join(' ');
        const rightStr = right.join(' ');
        let score = Math.abs(leftStr.length - rightStr.length) * 4;
        score += Math.abs(left.length - right.length) * 10;
        if (left.length > limits.maxWordsPerLine) score += 50;
        if (right.length > limits.maxWordsPerLine) score += 50;
        if (leftStr.length > limits.maxCharsPerLine) score += 70;
        if (rightStr.length > limits.maxCharsPerLine) score += 70;
        if (unbalanced(left, right)) score += 120;
        if (endsSentence(left[left.length - 1])) score -= 18;
        if (/[,;:]$/.test(left[left.length - 1])) score -= 6;
        if (score < bestScore) {
            bestScore = score;
            best = i;
        }
    }
    return best;
}

function overTwoLineCapacity(words: string[], limits: LayoutLimits): boolean {
    return words.length > limits.maxWordsPerCue || words.join(' ').length > limits.maxCharsPerLine * 2;
}

function packWordGroups(words: string[], limits: LayoutLimits): string[][] {
    const groups: string[][] = [];
    let current: string[] = [];

    for (const word of words) {
        const next = [...current, word];
        if (current.length > 0 && overTwoLineCapacity(next, limits)) {
            groups.push(current);
            current = [word];
            continue;
        }
        current = next;
        if (endsSentence(word) && fitsOneLine(current, limits) && current.length >= 3) {
            groups.push(current);
            current = [];
        }
    }
    if (current.length) groups.push(current);

    if (groups.length >= 2) {
        const last = groups[groups.length - 1];
        const prev = groups[groups.length - 2];
        if (last.length <= 2 && !overTwoLineCapacity([...prev, ...last], limits)) {
            groups[groups.length - 2] = [...prev, ...last];
            groups.pop();
        }
    }
    return groups;
}

function splitTimedCue(sub: Subtitle, groups: string[][], screen: ScreenSize, mediaW?: number, mediaH?: number): Subtitle[] {
    const totalChars = Math.max(1, tokenize(sub.text).join(' ').length);
    const duration = Math.max(0.05, sub.endTime - sub.startTime);
    let t = sub.startTime;
    return groups.map((group, i) => {
        const frac = group.join(' ').length / totalChars;
        const end = i === groups.length - 1 ? sub.endTime : t + duration * frac;
        const piece: Subtitle = {
            ...sub,
            id: i === 0 ? sub.id : generateId(),
            startTime: t,
            endTime: Math.max(t + 0.05, end),
            text: layoutCueText(group.join(' '), screen, mediaW, mediaH),
        };
        t = end;
        return piece;
    });
}

/** Insert at most one line break so a cue is 1–2 balanced lines. */
export function layoutCueText(
    text: string,
    screen: ScreenSize = 'wide',
    mediaW?: number,
    mediaH?: number,
): string {
    const words = tokenize(text);
    if (words.length === 0) return '';
    const limits = layoutLimits(text, screen, mediaW, mediaH);
    if (fitsOneLine(words, limits)) return applyRtlTypography(words.join(' '));
    const splitAt = bestSplitIndex(words, limits);
    return applyRtlTypography(`${words.slice(0, splitAt).join(' ')}\n${words.slice(splitAt).join(' ')}`);
}

/** Rewrap cues for this frame; split anything too long for two balanced lines. */
export function layoutSubtitles(
    subtitles: Subtitle[],
    screen: ScreenSize = 'wide',
    mediaW?: number,
    mediaH?: number,
): Subtitle[] {
    const out: Subtitle[] = [];

    for (const sub of subtitles) {
        const words = tokenize(sub.text);
        if (words.length === 0) continue;
        const limits = layoutLimits(sub.text, screen, mediaW, mediaH);
        const groups = packWordGroups(words, limits);

        if (groups.length === 1) {
            const laid = layoutCueText(groups[0].join(' '), screen, mediaW, mediaH);
            const lines = laid.split('\n');
            if (lines.length === 2 && unbalanced(tokenize(lines[0]), tokenize(lines[1]))) {
                out.push(...splitTimedCue(sub, [tokenize(lines[0]), tokenize(lines[1])], screen, mediaW, mediaH));
                continue;
            }
            out.push({ ...sub, text: laid });
            continue;
        }

        out.push(...splitTimedCue(sub, groups, screen, mediaW, mediaH));
    }

    return out.map((s, i) => ({ ...s, index: i + 1 }));
}

const MERGE_GAP_SEC = 0.45;

/** Flatten, merge to the new frame budget, then wrap. Use when the render size changes. */
export function reflowSubtitles(
    subtitles: Subtitle[],
    screen: ScreenSize,
    mediaW?: number,
    mediaH?: number,
): Subtitle[] {
    const flat = subtitles
        .map(s => ({ ...s, text: tokenize(s.text).join(' ') }))
        .filter(s => s.text.length > 0);

    const merged: Subtitle[] = [];
    let i = 0;
    while (i < flat.length) {
        let cur = { ...flat[i] };
        while (i + 1 < flat.length) {
            const next = flat[i + 1];
            const gap = next.startTime - cur.endTime;
            const combined = `${cur.text} ${next.text}`;
            const limits = layoutLimits(combined, screen, mediaW, mediaH);
            if (gap > MERGE_GAP_SEC) break;
            if (tokenize(combined).length > limits.maxWordsPerCue) break;
            if (combined.length > limits.maxCharsPerLine * 2) break;
            cur = { ...cur, endTime: next.endTime, text: combined };
            i += 1;
        }
        merged.push(cur);
        i += 1;
    }

    return layoutSubtitles(merged, screen, mediaW, mediaH);
}
