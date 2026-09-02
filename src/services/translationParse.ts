export type ParsedTranslation = {
    byIndex: Map<number, string>;
    byId: Map<string, string>;
};

function stripFences(raw: string): string {
    return raw
        .replace(/```(?:json|txt|text)?/gi, '')
        .replace(/```/g, '')
        .trim();
}

function unescapeLine(text: string): string {
    return text.replace(/\\n/g, '\n').replace(/\\t/g, '\t').trim();
}

function extractJsonObjects(text: string): { id?: string; text: string }[] {
    const results: { id?: string; text: string }[] = [];
    let i = 0;

    while (i < text.length) {
        const start = text.indexOf('{', i);
        if (start === -1) break;

        let depth = 0;
        let inStr = false;
        let esc = false;
        let end = -1;

        for (let j = start; j < text.length; j++) {
            const c = text[j];
            if (inStr) {
                if (esc) {
                    esc = false;
                    continue;
                }
                if (c === '\\') {
                    esc = true;
                    continue;
                }
                if (c === '"') inStr = false;
                continue;
            }
            if (c === '"') {
                inStr = true;
                continue;
            }
            if (c === '{') depth++;
            if (c === '}') {
                depth--;
                if (depth === 0) {
                    end = j;
                    break;
                }
            }
        }

        if (end === -1) break;

        try {
            const obj = JSON.parse(text.slice(start, end + 1)) as { id?: unknown; text?: unknown };
            if (obj && obj.text != null) {
                results.push({
                    id: obj.id != null ? String(obj.id) : undefined,
                    text: String(obj.text),
                });
            }
        } catch {
            // skip malformed object
        }
        i = end + 1;
    }

    return results;
}

function tryParseJsonArray(text: string): { id?: string; text: string }[] | null {
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start === -1 || end <= start) return extractJsonObjects(text);

    try {
        const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
        if (!Array.isArray(parsed)) return extractJsonObjects(text);
        return parsed
            .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
            .filter(item => item.text != null)
            .map(item => ({
                id: item.id != null ? String(item.id) : undefined,
                text: String(item.text),
            }));
    } catch {
        return extractJsonObjects(text);
    }
}

function parseNumberedLines(text: string): Map<number, string> {
    const byIndex = new Map<number, string>();
    const re = /\[(\d+)\]\s*(.*?)(?=\n\s*\[\d+\]\s*|\s*$)/gs;
    for (const match of text.matchAll(re)) {
        const index = Number(match[1]);
        if (!Number.isFinite(index) || index < 1) continue;
        byIndex.set(index, unescapeLine(match[2] ?? ''));
    }
    return byIndex;
}

export function parseTranslationResponse(raw: string): ParsedTranslation {
    const text = stripFences(raw);
    const byIndex = parseNumberedLines(text);
    const byId = new Map<string, string>();

    const jsonItems = tryParseJsonArray(text);
    if (jsonItems) {
        jsonItems.forEach((item, i) => {
            if (item.id) byId.set(item.id, item.text);
            if (item.id && /^\d+$/.test(item.id)) {
                byIndex.set(Number(item.id), item.text);
            } else if (!item.id && item.text) {
                byIndex.set(i + 1, item.text);
            }
        });
    }

    return { byIndex, byId };
}

export function applyParsedTranslations(
    originals: { id: string; text: string }[],
    parsed: ParsedTranslation,
): string[] {
    return originals.map((sub, i) => {
        const fromId = parsed.byId.get(sub.id);
        if (fromId != null && fromId !== '') return fromId;
        const fromIndex = parsed.byIndex.get(i + 1);
        if (fromIndex != null && fromIndex !== '') return fromIndex;
        return sub.text;
    });
}

export function translationHitCount(originals: { id: string; text: string }[], parsed: ParsedTranslation): number {
    return originals.filter((sub, i) => {
        const next = parsed.byId.get(sub.id) ?? parsed.byIndex.get(i + 1);
        return next != null && next.trim() !== '';
    }).length;
}

export function formatTranslationInput(texts: string[]): string {
    return texts.map((text, i) => `[${i + 1}] ${text.replace(/\n/g, '\\n')}`).join('\n');
}
