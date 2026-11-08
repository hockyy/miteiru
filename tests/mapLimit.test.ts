import assert from "node:assert/strict";
import {afterEach, describe, it} from "node:test";
import {mapLimit} from "../main/helpers/mapLimit";
import {JobCancelledError} from "../main/helpers/runCommand";

const delay = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => {
    clearTimeout(timer);
    reject(new Error("aborted"));
  }, {once: true});
});

const realAny = (AbortSignal as {any?: unknown}).any;
afterEach(() => {
  (AbortSignal as {any?: unknown}).any = realAny;
});

for (const variant of ["AbortSignal.any", "an old webview without AbortSignal.any"]) {
  describe(`mapLimit, with ${variant}`, () => {
    const setUp = () => {
      if (variant !== "AbortSignal.any") delete (AbortSignal as {any?: unknown}).any;
    };

    it("returns results in order, never running more than `limit` at once", async () => {
      setUp();
      let running = 0;
      let most = 0;
      const results = await mapLimit([30, 5, 20, 10, 15, 5, 25], 3, new AbortController().signal, async (ms, index) => {
        running++;
        most = Math.max(most, running);
        await delay(ms);
        running--;
        return index * 10;
      });
      assert.equal(most, 3);
      assert.deepEqual(results, [0, 10, 20, 30, 40, 50, 60]);
    });

    it("throws the first failure, aborting the runs in flight and starting no more", async () => {
      setUp();
      const started: number[] = [];
      const abortedInFlight: number[] = [];
      const failure = new Error("batch 1 failed");
      await assert.rejects(mapLimit([0, 1, 2, 3, 4, 5], 3, new AbortController().signal, async (_item, index, signal) => {
        started.push(index);
        if (index === 1) {
          await delay(5);
          throw failure;
        }
        try {
          await delay(60, signal);
        } catch (error) {
          abortedInFlight.push(index);
          throw error;
        }
      }), (error) => error === failure);
      assert.deepEqual(started.sort((a, b) => a - b), [0, 1, 2]);
      assert.deepEqual(abortedInFlight.sort((a, b) => a - b), [0, 2]);
    });

    it("stops with a cancellation when the job's signal aborts", async () => {
      setUp();
      const job = new AbortController();
      const started: number[] = [];
      setTimeout(() => job.abort(), 5);
      await assert.rejects(mapLimit([0, 1, 2, 3, 4, 5], 2, job.signal, async (_item, index) => {
        started.push(index);
        await delay(15);
      }), (error) => error instanceof JobCancelledError);
      assert.deepEqual(started.sort((a, b) => a - b), [0, 1]);
    });

    it("leaves no listeners on the job's signal, which serves many requests", async () => {
      setUp();
      const job = new AbortController();
      let added = 0;
      let removed = 0;
      const add = job.signal.addEventListener.bind(job.signal);
      const remove = job.signal.removeEventListener.bind(job.signal);
      job.signal.addEventListener = ((...args: Parameters<typeof add>) => { added++; return add(...args); }) as typeof add;
      job.signal.removeEventListener = ((...args: Parameters<typeof remove>) => { removed++; return remove(...args); }) as typeof remove;
      await mapLimit([1, 2, 3], 2, job.signal, async (ms) => delay(ms));
      // AbortSignal.any keeps its own bookkeeping; the fallback must undo every listener it added.
      if (variant !== "AbortSignal.any") assert.equal(removed, added);
    });
  });
}
