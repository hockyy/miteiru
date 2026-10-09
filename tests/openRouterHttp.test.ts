import assert from "node:assert/strict";
import {test} from "node:test";
import {OpenRouterHttpError, withRetries} from "../main/helpers/openRouterHttp";
import {JobCancelledError} from "../main/helpers/runCommand";

const failing = (error: Error) => {
  let calls = 0;
  const fn = async () => {
    calls++;
    throw error;
  };
  return {fn, calls: () => calls};
};

test("withRetries gives up at once on a request OpenRouter rejects", async () => {
  for (const status of [400, 401, 402, 404]) {
    const attempt = failing(new OpenRouterHttpError(`OpenRouter ${status}`, status));
    await assert.rejects(withRetries(attempt.fn, {delayMs: 0}), /OpenRouter/);
    assert.equal(attempt.calls(), 1, `status ${status}`);
  }
  const cancelled = failing(new JobCancelledError());
  await assert.rejects(withRetries(cancelled.fn, {delayMs: 0}), JobCancelledError);
  assert.equal(cancelled.calls(), 1);
});

test("withRetries retries rate limits, server errors and network failures", async () => {
  for (const error of [new OpenRouterHttpError("OpenRouter 429", 429), new OpenRouterHttpError("OpenRouter 503", 503), new Error("socket hang up")]) {
    const attempt = failing(error);
    await assert.rejects(withRetries(attempt.fn, {delayMs: 0, attempts: 3}));
    assert.equal(attempt.calls(), 3, error.message);
  }
  let calls = 0;
  const flaky = async () => {
    if (++calls < 2) throw new OpenRouterHttpError("OpenRouter 502", 502);
    return "ok";
  };
  assert.equal(await withRetries(flaky, {delayMs: 0}), "ok");
});
