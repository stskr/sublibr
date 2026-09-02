import { describe, it, expect } from 'vitest';
import {
    parseTranslationResponse,
    applyParsedTranslations,
    translationHitCount,
    formatTranslationInput,
} from '../src/services/translationParse';

const originals = [
    { id: 'aaa', text: 'שלום' },
    { id: 'bbb', text: 'מה נשמע' },
    { id: 'ccc', text: 'כן' },
];

describe('parseTranslationResponse', () => {
    it('reads numbered lines', () => {
        const parsed = parseTranslationResponse('[1] Hola\n[2] ¿Qué tal?\n[3] Sí');
        expect(applyParsedTranslations(originals, parsed)).toEqual(['Hola', '¿Qué tal?', 'Sí']);
    });

    it('salvages complete JSON objects when the last string is truncated', () => {
        const raw = `[
  {"id": "aaa", "text": "Hola"},
  {"id": "bbb", "text": "Muy bien"},
  {"id": "ccc", "text": "unterminated
`;
        const parsed = parseTranslationResponse(raw);
        const texts = applyParsedTranslations(originals, parsed);
        expect(texts[0]).toBe('Hola');
        expect(texts[1]).toBe('Muy bien');
        expect(texts[2]).toBe('כן');
        expect(translationHitCount(originals, parsed)).toBe(2);
    });

    it('maps JSON ids back onto the original cues', () => {
        const parsed = parseTranslationResponse(JSON.stringify([
            { id: 'ccc', text: 'Sí' },
            { id: 'aaa', text: 'Hola' },
        ]));
        expect(applyParsedTranslations(originals, parsed)).toEqual(['Hola', 'מה נשמע', 'Sí']);
    });

    it('ignores markdown fences', () => {
        const parsed = parseTranslationResponse('```\n[1] Hola\n[2] Bien\n[3] Sí\n```');
        expect(applyParsedTranslations(originals, parsed)[0]).toBe('Hola');
    });
});

describe('formatTranslationInput', () => {
    it('numbers lines and escapes real newlines', () => {
        expect(formatTranslationInput(['a', 'b\nc'])).toBe('[1] a\n[2] b\\nc');
    });
});
