/**
 * Helpers for showing a streamed JSON answer before it is complete.
 * Used by: utils/openRouterClient.ts (throttle), hooks/useSentenceAnalysis.ts, hooks/useAiTranslation.ts
 */
import { parsePartialJson } from 'ai';

export const PARTIAL_UPDATE_INTERVAL_MS = 60;

export interface ThrottledEmitter {
  /** Offer the latest accumulated text; emits at most once per interval. */
  push: (text: string) => void;
  /** Emit the final text right away (drops any pending update). */
  flush: (text: string) => void;
  /** Drop any pending update without emitting, for a stream that failed or was cancelled. */
  cancel: () => void;
}

export function createThrottledEmitter(
  emit: (text: string) => void,
  intervalMs = PARTIAL_UPDATE_INTERVAL_MS,
  now: () => number = Date.now,
): ThrottledEmitter {
  let lastEmit = Number.NEGATIVE_INFINITY;
  let latest = '';
  let timer: ReturnType<typeof setTimeout> | null = null;

  const fire = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    lastEmit = now();
    emit(latest);
  };

  return {
    push(text) {
      latest = text;
      const wait = intervalMs - (now() - lastEmit);
      if (wait <= 0) {
        fire();
      } else if (!timer) {
        timer = setTimeout(fire, wait); // trailing update so a stalled stream still shows its latest text
      }
    },
    flush(text) {
      latest = text;
      fire();
    },
    cancel() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

/** The `{ ... }` part of a (possibly unfinished) reply, skipping prose and a ```json fence. */
export function partialJsonObjectText(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) {
    return null;
  }
  return text.slice(start).replace(/\s*```\s*$/, '');
}

export async function parsePartialObject(
  text: string,
  parse: (jsonText: string) => Promise<{ value: unknown }> = parsePartialJson,
): Promise<unknown> {
  const jsonText = partialJsonObjectText(text);
  if (!jsonText) {
    return undefined;
  }
  try {
    const { value } = await parse(jsonText);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Turns streamed text into partial results. `normalize` returns null while nothing useful is there yet.
 * Out-of-order async parses are dropped, and nothing is delivered once `isStale()` says so.
 */
export function createPartialHandler<T>(
  normalize: (value: unknown) => T | null,
  onPartial: (value: T) => void,
  isStale: () => boolean,
  parse?: (jsonText: string) => Promise<{ value: unknown }>,
): (text: string) => void {
  let sequence = 0;
  return (text) => {
    const mine = ++sequence;
    void parsePartialObject(text, parse).then((value) => {
      if (mine !== sequence || isStale() || value === undefined) {
        return;
      }
      const partial = normalize(value);
      if (partial) {
        onPartial(partial);
      }
    });
  };
}
