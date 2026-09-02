import { describe, it, expect } from 'vitest';
import { scaleFontToFrame, FONT_REFERENCE_WIDTH, fontSizeForPlayRes, previewFontSize, defaultSubtitlePositionY, effectiveSubtitlePositionY } from '../src/types';

describe('scaleFontToFrame', () => {
    it('leaves the default size unchanged on 1080p', () => {
        expect(scaleFontToFrame(56, 1920, 1080)).toBe(56);
    });

    it('shrinks onto a 640×360 original so it is not huge', () => {
        expect(scaleFontToFrame(56, 640, 360)).toBeCloseTo(56 * (640 / FONT_REFERENCE_WIDTH));
    });

    it('uses the short side on square and vertical frames', () => {
        const square = scaleFontToFrame(56, 1080, 1080);
        const vertical = scaleFontToFrame(56, 1080, 1920);
        expect(square).toBeCloseTo(56 * (1080 / FONT_REFERENCE_WIDTH));
        expect(vertical).toBeCloseTo(square);
        expect(square).toBeGreaterThan(30);
    });
});

describe('fontSizeForPlayRes', () => {
    it('keeps 56 on 16:9 1080p', () => {
        expect(fontSizeForPlayRes(56, 'wide')).toBe(56);
    });

    it('is smaller on a 640×360 original than on 1080p', () => {
        expect(fontSizeForPlayRes(56, 'original', 640, 360)).toBeLessThan(40);
    });

    it('is larger on 9:16 than a naive 1920-scaled 8px preview would be', () => {
        expect(fontSizeForPlayRes(56, 'vertical')).toBeGreaterThanOrEqual(48);
    });
});

describe('previewFontSize', () => {
    it('does not blow up on a wide preview canvas', () => {
        const px = previewFontSize(56, 'wide', 900);
        expect(px).toBeLessThan(40);
        expect(px).toBeGreaterThan(15);
    });

    it('scales down when the 9:16 canvas is narrow', () => {
        const wide = previewFontSize(56, 'wide', 900);
        const vertical = previewFontSize(56, 'vertical', 280);
        expect(vertical).toBeLessThan(wide);
        expect(vertical).toBeGreaterThan(10);
    });
});

describe('defaultSubtitlePositionY', () => {
    it('puts 16:9 at 95% (5% of height under a bottom-center cue)', () => {
        expect(defaultSubtitlePositionY('wide')).toBe(95);
    });

    it('puts 1:1 at 95% (same short-side gap)', () => {
        expect(defaultSubtitlePositionY('square')).toBe(95);
    });

    it('puts 9:16 lower on the frame than 16:9 (same pixel gap, taller PlayResY)', () => {
        expect(defaultSubtitlePositionY('vertical')).toBe(97);
        expect(defaultSubtitlePositionY('vertical')).toBeGreaterThan(defaultSubtitlePositionY('wide'));
    });

    it('matches 16:9 math on a 640×360 original', () => {
        expect(defaultSubtitlePositionY('original', 640, 360)).toBe(95);
    });

    it('uses the computed default until the user overrides', () => {
        expect(effectiveSubtitlePositionY({ positionY: 85, positionYAuto: true }, 'vertical')).toBe(97);
        expect(effectiveSubtitlePositionY({ positionY: 80, positionYAuto: false }, 'vertical')).toBe(80);
    });
});
