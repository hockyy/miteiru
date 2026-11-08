/**
 * Small LRU for finished AI results, plus de-duplication of identical requests in flight.
 * Used by: hooks/useSentenceAnalysis.ts, hooks/useAiTranslation.ts
 *
 * Only successful, un-aborted results are stored. Identical requests that overlap share one
 * network call; the call is cancelled only when every caller has gone away.
 */

export interface AiTaskContext {
  signal: AbortSignal;
  onText: (text: string) => void;
}

export interface AiRunOptions {
  signal?: AbortSignal;
  onText?: (text: string) => void;
}

export function createAbortError(): Error {
  const error = new Error('The request was aborted.');
  error.name = 'AbortError';
  return error;
}

/** A failure with a message that is already fit to show the user; hooks display it as is. */
export class AiResultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiResultError';
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/** Key from the feature plus everything that changes the prompt (model, language, input, options). */
export function makeAiCacheKey(
  feature: string,
  model: string,
  lang: string,
  input: string | string[],
  extras: unknown = null,
): string {
  const normalized = Array.isArray(input)
    ? input.map((item) => item.trim().normalize('NFC'))
    : input.trim().normalize('NFC');
  return JSON.stringify([feature, model.trim(), lang, normalized, extras]);
}

interface Subscriber {
  onText?: (text: string) => void;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

interface Flight {
  controller: AbortController;
  subscribers: Set<Subscriber>;
  lastText: string;
}

export class AiResultCache {
  private readonly results = new Map<string, unknown>();
  private readonly flights = new Map<string, Flight>();

  constructor(private readonly maxEntries = 100) {}

  has(key: string): boolean {
    return this.results.has(key);
  }

  get size(): number {
    return this.results.size;
  }

  private store(key: string, value: unknown) {
    this.results.delete(key);
    this.results.set(key, value);
    while (this.results.size > this.maxEntries) {
      const oldest = this.results.keys().next().value as string;
      this.results.delete(oldest);
    }
  }

  run<T>(key: string, task: (context: AiTaskContext) => Promise<T>, options: AiRunOptions = {}): Promise<T> {
    const { signal, onText } = options;
    if (signal?.aborted) {
      return Promise.reject(createAbortError());
    }

    if (this.results.has(key)) {
      const value = this.results.get(key) as T;
      this.store(key, value); // refresh recency
      return Promise.resolve(value);
    }

    let flight = this.flights.get(key);
    if (!flight) {
      const started: Flight = { controller: new AbortController(), subscribers: new Set(), lastText: '' };
      flight = started;
      this.flights.set(key, started);
      const finish = () => {
        if (this.flights.get(key) === started) {
          this.flights.delete(key);
        }
      };
      Promise.resolve()
        .then(() => task({
          signal: started.controller.signal,
          onText: (text) => {
            started.lastText = text;
            started.subscribers.forEach((subscriber) => subscriber.onText?.(text));
          },
        }))
        .then(
          (value) => {
            finish();
            if (started.controller.signal.aborted) {
              return;
            }
            this.store(key, value);
            started.subscribers.forEach((subscriber) => subscriber.resolve(value));
          },
          (error) => {
            finish();
            started.subscribers.forEach((subscriber) => subscriber.reject(error));
          },
        );
    }

    const shared = flight;
    return new Promise<T>((resolve, reject) => {
      const subscriber: Subscriber = { onText, resolve: resolve as (value: unknown) => void, reject };
      shared.subscribers.add(subscriber);
      if (shared.lastText) {
        onText?.(shared.lastText); // joined mid-stream: catch up
      }
      signal?.addEventListener('abort', () => {
        if (!shared.subscribers.delete(subscriber)) {
          return;
        }
        reject(createAbortError());
        if (shared.subscribers.size === 0) {
          shared.controller.abort();
          if (this.flights.get(key) === shared) {
            this.flights.delete(key);
          }
        }
      }, { once: true });
    });
  }
}

export const aiResultCache = new AiResultCache(100);
