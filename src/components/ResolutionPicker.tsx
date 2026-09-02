import type { ScreenSize } from '../types';

type Option = {
    value: ScreenSize;
    label: string;
    hint: string;
    ratio: [number, number];
};

interface ResolutionPickerProps {
    value: ScreenSize;
    onChange: (value: ScreenSize) => void;
    mediaWidth?: number;
    mediaHeight?: number;
}

export function ResolutionPicker({ value, onChange, mediaWidth, mediaHeight }: ResolutionPickerProps) {
    const originalRatio: [number, number] =
        mediaWidth && mediaHeight ? [mediaWidth, mediaHeight] : [16, 9];

    const options: Option[] = [
        {
            value: 'original',
            label: 'Original',
            hint: mediaWidth && mediaHeight ? `${mediaWidth}×${mediaHeight}` : 'Source',
            ratio: originalRatio,
        },
        { value: 'wide', label: '16:9', hint: '1920×1080', ratio: [16, 9] },
        { value: 'square', label: '1:1', hint: '1080×1080', ratio: [1, 1] },
        { value: 'vertical', label: '9:16', hint: '1080×1920', ratio: [9, 16] },
    ];

    return (
        <div className="resolution-picker" role="radiogroup" aria-label="Render resolution">
            {options.map((opt) => {
                const selected = value === opt.value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={`resolution-tile${selected ? ' selected' : ''}`}
                        onClick={() => onChange(opt.value)}
                        title={`${opt.label} — ${opt.hint}`}
                    >
                        <span className="resolution-stage" aria-hidden>
                            <span
                                className="resolution-frame"
                                style={{ aspectRatio: `${opt.ratio[0]} / ${opt.ratio[1]}` }}
                            />
                        </span>
                        <span className="resolution-label">{opt.label}</span>
                        <span className="resolution-hint">{opt.hint}</span>
                    </button>
                );
            })}
        </div>
    );
}
