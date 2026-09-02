import { describe, it, expect } from 'vitest';
import { applyRtlTypography, detectDirection } from '../src/utils';

describe('applyRtlTypography', () => {
    it('moves a leading ! to the end of a Hebrew line', () => {
        expect(applyRtlTypography('!פרפרים - עשינו')).toBe('פרפרים - עשינו!');
    });

    it('moves a leading ? to the end of an Arabic line', () => {
        expect(applyRtlTypography('?مرحبا')).toBe('مرحبا?');
    });

    it('leaves already-correct trailing punctuation', () => {
        expect(applyRtlTypography('שלום!')).toBe('שלום!');
    });

    it('does not change English', () => {
        expect(applyRtlTypography('Hello!')).toBe('Hello!');
        expect(applyRtlTypography('!Hello')).toBe('!Hello');
    });

    it('fixes each line of a cue', () => {
        expect(applyRtlTypography('עם מסאז\'\n!פרפרים')).toBe('עם מסאז\'\nפרפרים!');
    });
});

describe('detectDirection', () => {
    it('detects Hebrew as rtl', () => {
        expect(detectDirection('עשינו')).toBe('rtl');
    });
});
