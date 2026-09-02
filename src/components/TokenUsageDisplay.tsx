import { useState, useRef, useEffect } from 'react';
import type { SessionTokenStats, AIProvider } from '../types';
import { PROVIDER_LABELS, sessionModelLabel } from '../services/providers';

interface TokenUsageDisplayProps {
    stats: SessionTokenStats;
}

export function TokenUsageDisplay({ stats }: TokenUsageDisplayProps) {
    const [showPopup, setShowPopup] = useState(false);
    const popupRef = useRef<HTMLDivElement>(null);

    const totalTokens = stats.totalInputTokens + stats.totalOutputTokens;

    // Close popup on outside click
    useEffect(() => {
        if (!showPopup) return;
        function handleClickOutside(e: MouseEvent) {
            if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
                setShowPopup(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showPopup]);

    if (stats.calls.length === 0) return null;

    // Group calls by provider+model
    const grouped = stats.calls.reduce<Record<string, { inputTokens: number; outputTokens: number; calls: number; provider: string; model: string; estimated: boolean }>>((acc, call) => {
        const key = `${call.provider}:${call.model}`;
        if (!acc[key]) {
            acc[key] = { inputTokens: 0, outputTokens: 0, calls: 0, provider: call.provider, model: call.model, estimated: false };
        }
        acc[key].inputTokens += call.inputTokens;
        acc[key].outputTokens += call.outputTokens;
        acc[key].calls += 1;
        if (call.estimated) acc[key].estimated = true;
        return acc;
    }, {});

    function formatTokenCount(n: number): string {
        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
        if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
        return n.toLocaleString();
    }

    function getModelLabel(provider: string, modelId: string): string {
        return sessionModelLabel(provider as AIProvider, modelId);
    }

    function formatCount(n: number, estimated: boolean): string {
        return `${estimated ? '~' : ''}${formatTokenCount(n)}`;
    }

    const anyEstimated = stats.calls.some(call => call.estimated);

    return (
        <div className="token-usage-wrapper" ref={popupRef}>
            <button
                className="token-usage-badge"
                onClick={() => setShowPopup(!showPopup)}
                    title="Session token usage"
                    aria-expanded={showPopup}
                    aria-label="Session token usage"
            >
                <span className="icon icon-sm">toll</span>
                <span className="token-usage-text">
                    {formatCount(totalTokens, anyEstimated)} tokens
                </span>
            </button>

            {showPopup && (
                <div className="token-usage-popup" role="dialog" aria-label="Token usage details">
                    <div className="token-popup-header">
                        <h3>Session tokens</h3>
                        <span className="token-popup-calls">{stats.calls.length} API call{stats.calls.length !== 1 ? 's' : ''}</span>
                    </div>

                    <div className="token-popup-summary">
                        <div className="token-popup-stat">
                            <span className="token-popup-label">Input</span>
                            <span className="token-popup-value">{formatCount(stats.totalInputTokens, anyEstimated)}</span>
                        </div>
                        <div className="token-popup-stat">
                            <span className="token-popup-label">Output</span>
                            <span className="token-popup-value">{formatCount(stats.totalOutputTokens, anyEstimated)}</span>
                        </div>
                        <div className="token-popup-stat">
                            <span className="token-popup-label">Total</span>
                            <span className="token-popup-value accent">{formatCount(totalTokens, anyEstimated)}</span>
                        </div>
                    </div>

                    {Object.entries(grouped).length > 0 && (
                        <div className="token-popup-breakdown">
                            <h4>By model</h4>
                            {Object.entries(grouped).map(([key, group]) => (
                                <div key={key} className="token-popup-provider">
                                    <div className="token-popup-provider-header">
                                        <span className="token-popup-provider-name">
                                            {PROVIDER_LABELS[group.provider as keyof typeof PROVIDER_LABELS]}
                                        </span>
                                        <span className="token-popup-provider-model">
                                            {getModelLabel(group.provider, group.model)}
                                        </span>
                                    </div>
                                    <div className="token-popup-provider-stats">
                                        <span>{formatCount(group.inputTokens, group.estimated)} in</span>
                                        <span>{formatCount(group.outputTokens, group.estimated)} out</span>
                                        <span>{group.calls} call{group.calls !== 1 ? 's' : ''}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {anyEstimated && (
                        <p className="token-popup-footnote">
                            ~ is an estimate when the API does not return usage.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
