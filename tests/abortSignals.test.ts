import assert from "node:assert/strict";
import {afterEach, describe, it} from "node:test";
import {linkAbortSignals, timeoutSignal} from "../main/helpers/abortSignals";

const real = {
  any: (AbortSignal as {any?: unknown}).any,
  timeout: (AbortSignal as {timeout?: unknown}).timeout,
};
afterEach(() => {
  (AbortSignal as {any?: unknown}).any = real.any;
  (AbortSignal as {timeout?: unknown}).timeout = real.timeout;
});
const withoutNewApis = () => {
  delete (AbortSignal as {any?: unknown}).any;
  delete (AbortSignal as {timeout?: unknown}).timeout;
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

for (const variant of ["the new APIs", "an old webview's fallback"]) {
  describe(`abort signals, with ${variant}`, () => {
    const setUp = () => {
      if (variant !== "the new APIs") withoutNewApis();
    };

    it("aborts when any of the signals does, with that signal's reason", () => {
      setUp();
      const a = new AbortController();
      const b = new AbortController();
      const linked = linkAbortSignals([a.signal, undefined, b.signal]);
      assert.equal(linked.signal?.aborted, false);
      const reason = new Error("job cancelled");
      b.abort(reason);
      assert.equal(linked.signal?.aborted, true);
      assert.equal(linked.signal?.reason, reason);
      linked.dispose();
    });

    it("is already aborted when one of the signals is", () => {
      setUp();
      const a = new AbortController();
      a.abort(new Error("before"));
      const linked = linkAbortSignals([a.signal, new AbortController().signal]);
      assert.equal(linked.signal?.aborted, true);
      linked.dispose();
    });

    it("passes a single signal through, and nothing through for none", () => {
      setUp();
      const a = new AbortController();
      assert.equal(linkAbortSignals([undefined, a.signal]).signal, a.signal);
      assert.equal(linkAbortSignals([undefined]).signal, undefined);
    });

    it("times out with a TimeoutError, and not after dispose", async () => {
      setUp();
      const fires = timeoutSignal(10);
      const disposed = timeoutSignal(10);
      disposed.dispose();
      await sleep(40);
      assert.equal(fires.signal.aborted, true);
      assert.equal((fires.signal.reason as Error).name, "TimeoutError");
      // AbortSignal.timeout cannot be cancelled; only the fallback's timer is cleared.
      if (variant !== "the new APIs") assert.equal(disposed.signal.aborted, false);
    });
  });
}

describe("the fallback after dispose", () => {
  it("no longer follows the signals", () => {
    withoutNewApis();
    const a = new AbortController();
    const b = new AbortController();
    const linked = linkAbortSignals([a.signal, b.signal]);
    linked.dispose();
    a.abort();
    assert.equal(linked.signal?.aborted, false);
  });
});
