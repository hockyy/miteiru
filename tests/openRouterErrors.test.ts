import assert from "node:assert/strict";
import {test} from "node:test";
import {APICallError, RetryError} from "ai";
import {describeOpenRouterError, streamOpenRouterCompletion} from "../renderer/utils/openRouterClient";

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

test("a rate limit that outlasted the retries still gets its message", () => {
  const retried = new RetryError({message: "Failed after 3 attempts", reason: "maxRetriesExceeded", errors: [apiError(429)]});
  assert.match(describeOpenRouterError(retried).message, /too many requests/);
});

test("an error sent inside the stream reads as a message, never [object Object]", () => {
  assert.match(describeOpenRouterError({code: 402, message: "x"}).message, /out of credits/);
  assert.equal(describeOpenRouterError({code: "server_error", message: "Provider disconnected"}).message, "Provider disconnected");
  assert.equal(describeOpenRouterError({code: 500, message: "Upstream failed"}).message, "Upstream failed");
  assert.doesNotMatch(describeOpenRouterError({}).message, /\[object Object\]/);
  assert.equal(describeOpenRouterError({code: 7}).message, '{"code":7}');
});

test("a refusal to answer without thinking is asked again even after a retry", async () => {
  const realFetch = globalThis.fetch;
  const bodies: Array<Record<string, unknown>> = [];
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
    status,
    headers: {"Content-Type": "application/json"}
  });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    assert.ok(url.startsWith("https://openrouter.ai/"));
    bodies.push(JSON.parse(String(init?.body ?? "{}")));
    if (bodies.length === 1) return json(429, {error: {message: "Rate limited", code: 429}});
    if (bodies.length === 2) return json(400, {error: {message: "Reasoning is mandatory for this endpoint and cannot be disabled.", code: 400}});
    const send = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`;
    const stream = send({id: "t", model: "t", choices: [{index: 0, delta: {role: "assistant", content: "Good morning."}, finish_reason: null}]})
      + send({id: "t", model: "t", choices: [{index: 0, delta: {content: ""}, finish_reason: "stop"}], usage: {prompt_tokens: 1, completion_tokens: 1, total_tokens: 2}})
      + "data: [DONE]\n\n";
    return new Response(stream, {status: 200, headers: {"Content-Type": "text/event-stream"}});
  }) as typeof fetch;
  try {
    const text = await streamOpenRouterCompletion("sk-test", "test/must-think", [{role: "user", content: "hi"}]);
    assert.equal(text, "Good morning.");
    assert.equal(bodies.length, 3);
    assert.ok("reasoning" in bodies[1]);
    assert.ok(!("reasoning" in bodies[2]));
  } finally {
    globalThis.fetch = realFetch;
  }
});
