import React from 'react';
import {useAiUsage} from '../../hooks/useAiUsage';

export const formatAiCost = (cost: number) => `$${cost.toFixed(cost > 0 && cost < 0.01 ? 4 : 2)}`;

export function AiCostIndicator() {
  const usage = useAiUsage();
  return <span title="Provider-reported AI spend recorded by Miteiru; requests without a reported price are marked +.">
    {usage ? `${formatAiCost(usage.observedCostUsd)}${usage.unpricedRequests ? ' +' : ''}` : '…'}
  </span>;
}

export function AiUsageDetails() {
  const usage = useAiUsage();
  if (!usage) return <p className="text-xs text-white/60">Loading tracked AI spend…</p>;
  return <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
    <div className="font-semibold">Tracked AI spend: {formatAiCost(usage.observedCostUsd)}</div>
    <div className="mt-1 text-xs text-white/60">{usage.totalRequests} requests recorded on this device. Cached results add no charge.</div>
    {usage.unpricedRequests > 0 && <div className="mt-1 text-xs text-amber-200">{usage.unpricedRequests} requests had no provider-reported price; the total is incomplete.</div>}
  </div>;
}
