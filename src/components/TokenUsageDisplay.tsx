import { useState, useRef, useEffect } from 'react';
import type { SessionTokenStats, TokenUsage } from '../types';
import { PROVIDER_LABELS, MODEL_OPTIONS, MODEL_PRICING, calculateCost } from '../services/providers';

interface TokenUsageDisplayProps {
    stats: SessionTokenStats;
}

export function TokenUsageDisplay({ stats }: TokenUsageDisplayProps) {
    const [showPopup, setShowPopup] = useState(false);
    const popupRef = useRef<HTMLDivElement>(null);

    const totalTokens = stats.totalInputTokens + stats.totalOutputTokens;
    const totalCost = calculateCost(stats.calls);

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

    if (totalTokens === 0) return null;

    // Group calls by provider+model
    const grouped = stats.calls.reduce<Record<string, { inputTokens: number; outputTokens: number; calls: number; provider: string; model: string }>>((acc, call) => {
        const key = `${call.provider}:${call.model}`;
        if (!acc[key]) {
            acc[key] = { inputTokens: 0, outputTokens: 0, calls: 0, provider: call.provider, model: call.model };
        }
        acc[key].inputTokens += call.inputTokens;
        acc[key].outputTokens += call.outputTokens;
        acc[key].calls += 1;
        return acc;
    }, {});

    function formatTokenCount(n: number): string {
        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
        if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
        return n.toLocaleString();
    }

    function formatCost(cost: number): string {
        if (cost < 0.01) return '<$0.01';
        return `$${cost.toFixed(2)}`;
    }

    function getModelLabel(provider: string, modelId: string): string {
        const providerKey = provider as keyof typeof MODEL_OPTIONS;
        const model = MODEL_OPTIONS[providerKey]?.find(m => m.value === modelId);
        return model?.label ?? modelId;
    }

    function getCostForGroup(calls: TokenUsage[]): number {
        return calculateCost(calls);
    }

    return (
        <div className="token-usage-wrapper" ref={popupRef}>
            <button
                className="token-usage-badge"
                onClick={() => setShowPopup(!showPopup)}
                title="Session token usage (click for details)"
                aria-expanded={showPopup}
                aria-label="Session token usage"
            >
                <span className="icon icon-sm">toll</span>
                <span className="token-usage-text">
                    {formatTokenCount(totalTokens)} tokens
                </span>
                <span className="token-usage-cost">{formatCost(totalCost)}</span>
            </button>

            {showPopup && (
                <div className="token-usage-popup" role="dialog" aria-label="Token usage details">
                    <div className="token-popup-header">
                        <h3>Session Token Usage</h3>
                        <span className="token-popup-calls">{stats.calls.length} API call{stats.calls.length !== 1 ? 's' : ''}</span>
                    </div>

                    <div className="token-popup-summary">
                        <div className="token-popup-stat">
                            <span className="token-popup-label">Input</span>
                            <span className="token-popup-value">{formatTokenCount(stats.totalInputTokens)}</span>
                        </div>
                        <div className="token-popup-stat">
                            <span className="token-popup-label">Output</span>
                            <span className="token-popup-value">{formatTokenCount(stats.totalOutputTokens)}</span>
                        </div>
                        <div className="token-popup-stat">
                            <span className="token-popup-label">Total</span>
                            <span className="token-popup-value accent">{formatTokenCount(totalTokens)}</span>
                        </div>
                        <div className="token-popup-stat">
                            <span className="token-popup-label">Est. Cost</span>
                            <span className="token-popup-value accent">{formatCost(totalCost)}</span>
                        </div>
                    </div>

                    {Object.entries(grouped).length > 0 && (
                        <div className="token-popup-breakdown">
                            <h4>By Provider</h4>
                            {Object.entries(grouped).map(([key, group]) => {
                                const groupCalls = stats.calls.filter(c => `${c.provider}:${c.model}` === key);
                                const groupCost = getCostForGroup(groupCalls);
                                const pricing = MODEL_PRICING[group.model];

                                return (
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
                                            <span>{formatTokenCount(group.inputTokens)} in</span>
                                            <span>{formatTokenCount(group.outputTokens)} out</span>
                                            <span>{group.calls} call{group.calls !== 1 ? 's' : ''}</span>
                                            <span className="accent">{formatCost(groupCost)}</span>
                                        </div>
                                        {pricing && (
                                            <div className="token-popup-pricing">
                                                ${pricing.input}/M in, ${pricing.output}/M out
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
