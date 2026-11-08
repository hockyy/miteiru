import assert from "node:assert/strict";
import {test} from "node:test";
import {APICallError} from "ai";
import {describeOpenRouterError} from "../renderer/utils/openRouterClient";

const apiError = (statusCode: number) => new APICallError({
  message: `HTTP ${statusCode}`,
  url: "https://openrouter.ai/api/v1/chat/completions",
  requestBodyValues: {},
  statusCode,
});

test("a refused key, no credits and rate limiting get messages the learner can act on", () => {
  assert.match(describeOpenRouterError(apiError(401)).message, /didn't accept your key/);
  assert.match(describeOpenRouterError(apiError(402)).message, /out of credits/);
  assert.match(describeOpenRouterError(apiError(429)).message, /too many requests/);
});

test("other errors keep their own message", () => {
  assert.equal(describeOpenRouterError(apiError(500)).message, "HTTP 500");
  assert.equal(describeOpenRouterError(new TypeError("network connection lost")).message, "network connection lost");
  assert.equal(describeOpenRouterError("odd").message, "odd");
});
