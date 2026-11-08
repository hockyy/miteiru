import {linkAbortSignals} from "./abortSignals";
import {throwIfAborted} from "./runCommand";

/**
 * Runs `fn` over `items`, `limit` at a time, starting them in order and returning the results in
 * order. The first failure aborts the signal given to the others, so their in-flight requests stop
 * instead of being paid for, and is then thrown. An abort of `signal` stops it the same way.
 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  signal: AbortSignal,
  fn: (item: T, index: number, signal: AbortSignal) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let firstError: unknown;
  let failedOnce = false;
  const failed = new AbortController();
  const linked = linkAbortSignals([signal, failed.signal]);
  const workSignal = linked.signal ?? failed.signal;

  const worker = async () => {
    while (true) {
      throwIfAborted(signal);
      if (failedOnce) {
        throw firstError;
      }
      const index = next++;
      if (index >= items.length) {
        return;
      }
      try {
        results[index] = await fn(items[index], index, workSignal);
      } catch (error) {
        if (!failedOnce) {
          failedOnce = true;
          firstError = error;
          failed.abort();
        }
        throw firstError;
      }
    }
  };

  try {
    const workerCount = Math.max(1, Math.min(limit, items.length));
    await Promise.all(Array.from({length: workerCount}, () => worker()));
  } finally {
    linked.dispose();
  }
  return results;
}
