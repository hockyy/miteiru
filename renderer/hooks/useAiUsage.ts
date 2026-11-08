import {useEffect, useState} from 'react';
import type {AiUsageSummary} from '../types/aiUsage';

export function useAiUsage() {
  const [usage, setUsage] = useState<AiUsageSummary | null>(null);
  useEffect(() => {
    let disposed = false;
    let received = false;
    const unsubscribe = window.backend.on('ai-usage:changed', (next: AiUsageSummary) => {
      received = true;
      if (!disposed) setUsage(next);
    });
    window.backend.invoke('ai-usage:get').then((next: AiUsageSummary) => {
      if (!disposed && !received) setUsage(next);
    }).catch(() => undefined);
    return () => { disposed = true; unsubscribe(); };
  }, []);
  return usage;
}
