import type { SubtitleStyle, ScreenSize } from '../types';
import { SCREEN_SIZE_FONT_DEFAULTS, DEFAULT_SUBTITLE_STYLE } from '../types';
import { buildSubtitleTextShadow, hexToRgba } from '../utils';
import { CustomSelect } from './CustomSelect';

interface SubtitleStylePanelProps {
    style: SubtitleStyle;
    onChange: (style: SubtitleStyle) => void;
    onBack: () => void;
    screenSize?: ScreenSize;
}

const FONT_OPTIONS = [
    { value: 'Arial', label: 'Arial' },
    { value: 'Helvetica', label: 'Helvetica' },
    { value: 'Verdana', label: 'Verdana' },
    { value: 'Georgia', label: 'Georgia' },
    { value: 'Impact', label: 'Impact' },
    { value: "'Courier New'", label: 'Courier New' },
];

const EFFECT_MODES: { value: SubtitleStyle['outlineMode']; label: string }[] = [
    { value: 'none', label: 'None' },
    { value: 'outline', label: 'Outline' },
    { value: 'shadow', label: 'Shadow' },
    { value: 'both', label: 'Both' },
];

// Minimal live-preview text to show the current style
function StylePreview({ style }: { style: SubtitleStyle }) {
    const textShadow = buildSubtitleTextShadow(style);
    const bg = style.backgroundEnabled
        ? hexToRgba(style.backgroundColor, style.backgroundOpacity)
        : 'transparent';

    return (
        <div className="style-preview-box">
            <span
                style={{
                    color: style.textColor,
                    fontFamily: style.fontFamily,
                    textShadow,
                    background: bg,
                    padding: style.backgroundEnabled ? '4px 10px' : undefined,
                    borderRadius: style.backgroundEnabled ? '3px' : undefined,
                    fontSize: '18px',
                    lineHeight: 1.4,
                }}
            >
                Preview Text
            </span>
        </div>
    );
}

function set<K extends keyof SubtitleStyle>(
    style: SubtitleStyle,
    key: K,
    value: SubtitleStyle[K],
    onChange: (s: SubtitleStyle) => void,
) {
    onChange({ ...style, [key]: value });
}

export function SubtitleStylePanel({ style, onChange, onBack, screenSize }: SubtitleStylePanelProps) {
    const showOutline = style.outlineMode === 'outline' || style.outlineMode === 'both';
    const showShadow = style.outlineMode === 'shadow' || style.outlineMode === 'both';

    const handleReset = () => {
        const defaultFontSize = screenSize ? SCREEN_SIZE_FONT_DEFAULTS[screenSize] : DEFAULT_SUBTITLE_STYLE.fontSize;
        onChange({ ...DEFAULT_SUBTITLE_STYLE, fontSize: defaultFontSize });
    };

    return (
        <div className="sidebar-section style-panel">
            <div className="style-panel-header">
                <button className="btn-secondary sidebar-action-btn" onClick={onBack}>
                    <span className="icon icon-sm">chevron_left</span>
                    Back
                </button>
                <button className="btn-secondary sidebar-action-btn style-reset-btn" onClick={handleReset} title="Reset to defaults">
                    <span className="icon icon-sm">restart_alt</span>
                    Reset
                </button>
            </div>

            <StylePreview style={style} />

            {/* Font */}
            <div className="style-control">
                <label className="sidebar-label">Font</label>
                <CustomSelect
                    options={FONT_OPTIONS}
                    value={style.fontFamily}
                    onChange={(v) => set(style, 'fontFamily', v, onChange)}
                />
            </div>

            {/* Font size */}
            <div className="style-control">
                <label className="sidebar-label">Font Size</label>
                <div className="style-slider-row">
                    <input
                        type="range" min={20} max={120} step={2}
                        value={style.fontSize}
                        onChange={(e) => set(style, 'fontSize', parseInt(e.target.value), onChange)}
                    />
                    <span className="style-slider-value">{style.fontSize}</span>
                </div>
            </div>

            {/* Text color */}
            <div className="style-control">
                <label className="sidebar-label">Text Color</label>
                <div className="style-color-row">
                    <input
                        type="color"
                        className="style-color-input"
                        value={style.textColor}
                        onChange={(e) => set(style, 'textColor', e.target.value, onChange)}
                    />
                    <span className="style-color-value">{style.textColor.toUpperCase()}</span>
                </div>
            </div>

            {/* Effect mode */}
            <div className="style-control">
                <label className="sidebar-label">Effect</label>
                <div className="style-mode-buttons">
                    {EFFECT_MODES.map(({ value, label }) => (
                        <button
                            key={value}
                            className={`style-mode-btn${style.outlineMode === value ? ' active' : ''}`}
                            onClick={() => set(style, 'outlineMode', value, onChange)}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Outline controls */}
            {showOutline && (
                <>
                    <div className="style-control">
                        <label className="sidebar-label">Outline Color</label>
                        <div className="style-color-row">
                            <input
                                type="color"
                                className="style-color-input"
                                value={style.outlineColor}
                                onChange={(e) => set(style, 'outlineColor', e.target.value, onChange)}
                            />
                            <span className="style-color-value">{style.outlineColor.toUpperCase()}</span>
                        </div>
                    </div>
                    <div className="style-control">
                        <label className="sidebar-label">Outline Width</label>
                        <div className="style-slider-row">
                            <input
                                type="range" min={0.5} max={5} step={0.5}
                                value={style.outlineWidth}
                                onChange={(e) => set(style, 'outlineWidth', parseFloat(e.target.value), onChange)}
                            />
                            <span className="style-slider-value">{style.outlineWidth}px</span>
                        </div>
                    </div>
                </>
            )}

            {/* Shadow controls */}
            {showShadow && (
                <>
                    <div className="style-control">
                        <label className="sidebar-label">Shadow Color</label>
                        <div className="style-color-row">
                            <input
                                type="color"
                                className="style-color-input"
                                value={style.shadowColor}
                                onChange={(e) => set(style, 'shadowColor', e.target.value, onChange)}
                            />
                            <span className="style-color-value">{style.shadowColor.toUpperCase()}</span>
                        </div>
                    </div>
                    <div className="style-control">
                        <label className="sidebar-label">Offset X</label>
                        <div className="style-slider-row">
                            <input
                                type="range" min={0} max={10} step={1}
                                value={style.shadowOffsetX}
                                onChange={(e) => set(style, 'shadowOffsetX', parseInt(e.target.value), onChange)}
                            />
                            <span className="style-slider-value">{style.shadowOffsetX}px</span>
                        </div>
                    </div>
                    <div className="style-control">
                        <label className="sidebar-label">Offset Y</label>
                        <div className="style-slider-row">
                            <input
                                type="range" min={0} max={10} step={1}
                                value={style.shadowOffsetY}
                                onChange={(e) => set(style, 'shadowOffsetY', parseInt(e.target.value), onChange)}
                            />
                            <span className="style-slider-value">{style.shadowOffsetY}px</span>
                        </div>
                    </div>
                    <div className="style-control">
                        <label className="sidebar-label">Blur</label>
                        <div className="style-slider-row">
                            <input
                                type="range" min={0} max={10} step={1}
                                value={style.shadowBlur}
                                onChange={(e) => set(style, 'shadowBlur', parseInt(e.target.value), onChange)}
                            />
                            <span className="style-slider-value">{style.shadowBlur}px</span>
                        </div>
                    </div>
                </>
            )}

            {/* Background box */}
            <div className="sidebar-divider" style={{ margin: '0.75rem 0' }} />
            <div className="style-control">
                <div className="style-toggle-row">
                    <label className="sidebar-label" style={{ marginBottom: 0 }}>Background Box</label>
                    <button
                        className={`style-toggle-btn${style.backgroundEnabled ? ' active' : ''}`}
                        onClick={() => set(style, 'backgroundEnabled', !style.backgroundEnabled, onChange)}
                    >
                        {style.backgroundEnabled ? 'On' : 'Off'}
                    </button>
                </div>
            </div>

            {style.backgroundEnabled && (
                <>
                    <div className="style-control">
                        <label className="sidebar-label">Background Color</label>
                        <div className="style-color-row">
                            <input
                                type="color"
                                className="style-color-input"
                                value={style.backgroundColor}
                                onChange={(e) => set(style, 'backgroundColor', e.target.value, onChange)}
                            />
                            <span className="style-color-value">{style.backgroundColor.toUpperCase()}</span>
                        </div>
                    </div>
                    <div className="style-control">
                        <label className="sidebar-label">Opacity</label>
                        <div className="style-slider-row">
                            <input
                                type="range" min={0} max={1} step={0.05}
                                value={style.backgroundOpacity}
                                onChange={(e) => set(style, 'backgroundOpacity', parseFloat(e.target.value), onChange)}
                            />
                            <span className="style-slider-value">{Math.round(style.backgroundOpacity * 100)}%</span>
                        </div>
                    </div>
                </>
            )}

            {/* Position */}
            <div className="sidebar-divider" style={{ margin: '0.75rem 0' }} />
            <div className="style-control">
                <label className="sidebar-label">Horizontal Position</label>
                <div className="style-slider-row">
                    <input
                        type="range" min={0} max={100} step={1}
                        value={style.positionX}
                        onChange={(e) => set(style, 'positionX', parseInt(e.target.value), onChange)}
                    />
                    <span className="style-slider-value">{style.positionX}%</span>
                </div>
            </div>
            <div className="style-control">
                <label className="sidebar-label">Vertical Position</label>
                <div className="style-slider-row">
                    <input
                        type="range" min={0} max={100} step={1}
                        value={style.positionY}
                        onChange={(e) => set(style, 'positionY', parseInt(e.target.value), onChange)}
                    />
                    <span className="style-slider-value">{style.positionY}%</span>
                </div>
            </div>
        </div>
    );
}
