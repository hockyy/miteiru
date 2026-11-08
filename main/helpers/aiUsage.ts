import {getStore} from "../handler/common/storeHandlers";
import type {AiUsageSummary} from "../../renderer/types/aiUsage";

export type {AiUsageSummary} from "../../renderer/types/aiUsage";

export const AI_USAGE_STORE_KEY = "aiUsage.totals";

type UsageStore = {
  get: (key: string, fallback?: unknown) => unknown;
  set: (key: string, value: unknown) => void | Promise<void>;
};

const nonnegativeNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
const count = (value: unknown) => Math.min(Number.MAX_SAFE_INTEGER, Math.floor(nonnegativeNumber(value)));

const normalizeSummary = (saved: unknown): AiUsageSummary => {
  const values = saved && typeof saved === "object" ? saved as Partial<AiUsageSummary> : {};
  const unpricedRequests = count(values.unpricedRequests);
  return {
    observedCostUsd: nonnegativeNumber(values.observedCostUsd),
    unpricedRequests,
    totalRequests: Math.max(unpricedRequests, count(values.totalRequests))
  };
};

/** Records actual response costs. A missing provider price remains unknown, never estimated. */
export function createAiUsageRecorder(openStore: () => Promise<UsageStore> = getStore) {
  let pending: Promise<void> = Promise.resolve();
  const subscribers = new Set<(summary: AiUsageSummary) => void>();

  const get = async (): Promise<AiUsageSummary> => {
    await pending;
    return normalizeSummary((await openStore()).get(AI_USAGE_STORE_KEY));
  };

  const record = (usage: unknown): Promise<AiUsageSummary> => {
    const cost = usage && typeof usage === "object" ? (usage as {cost?: unknown}).cost : undefined;
    const isPriced = typeof cost === "number" && Number.isFinite(cost) && cost >= 0;
    // Serialize read-modify-write operations: a pair of simultaneous ASR/translation responses
    // must both contribute, including while the persistent store is still opening.
    const recording = pending.then(async () => {
      const store = await openStore();
      const previous = normalizeSummary(store.get(AI_USAGE_STORE_KEY));
      const summary: AiUsageSummary = {
        observedCostUsd: Math.min(Number.MAX_VALUE, previous.observedCostUsd + (isPriced ? cost : 0)),
        unpricedRequests: Math.min(Number.MAX_SAFE_INTEGER, previous.unpricedRequests + (isPriced ? 0 : 1)),
        totalRequests: Math.min(Number.MAX_SAFE_INTEGER, previous.totalRequests + 1)
      };
      await store.set(AI_USAGE_STORE_KEY, summary);
      for (const subscriber of subscribers) {
        try { subscriber({...summary}); } catch (error) { console.warn("[AI usage] Could not notify a subscriber:", error); }
      }
      return {...summary};
    });
    pending = recording.then(() => undefined, () => undefined);
    return recording;
  };

  const subscribe = (subscriber: (summary: AiUsageSummary) => void) => {
    subscribers.add(subscriber);
    return () => { subscribers.delete(subscriber); };
  };

  return {get, record, subscribe};
}

const recorder = createAiUsageRecorder();
export const getAiUsage = recorder.get;
export const recordOpenRouterUsage = recorder.record;
export const subscribeAiUsage = recorder.subscribe;
