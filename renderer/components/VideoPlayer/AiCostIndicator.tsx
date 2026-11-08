import React from 'react';
import {Sparkles} from 'lucide-react';
import {useAiUsage} from '../../hooks/useAiUsage';
import {formatAiCost} from '../../utils/aiFormat';
import type {AiUsageSummary} from '../../types/aiUsage';

const requestCount = (count: number) => `${count} ${count === 1 ? 'request' : 'requests'}`;

/** What AI has cost on this device, for the Settings → AI tab. */
export function AiUsageView({usage}: {usage: AiUsageSummary | null}) {
  if (!usage) return <p className="text-xs text-white/60">Loading…</p>;
  return <div>
    <div className="text-2xl font-black tabular-nums">{formatAiCost(usage.observedCostUsd)}</div>
    <div className="mt-1 text-xs text-white/60">spent on AI on this device · {requestCount(usage.totalRequests)}</div>
    {usage.unpricedRequests > 0 && <div className="mt-2 text-xs text-amber-200">
      {requestCount(usage.unpricedRequests)} had no price from the provider, so the real total is a little higher.
    </div>}
    <div className="mt-2 text-xs text-white/60">Cached answers cost nothing.</div>
  </div>;
}

export const AiUsageDetails = () => <AiUsageView usage={useAiUsage()}/>;

/** The top bar's spend chip; the bar shows it only while an AI study tool is on. */
export function AiSpendChip({className, onClick}: {className: string; onClick: () => void}) {
  const usage = useAiUsage();
  return <button type="button" className={`${className} inline-flex items-center gap-1.5 text-amber-200 tabular-nums`}
    onClick={onClick} title="AI spend on this device. Click for AI settings.">
    <Sparkles size={14} aria-hidden="true"/>
    {usage ? formatAiCost(usage.observedCostUsd) : '…'}
  </button>;
}
