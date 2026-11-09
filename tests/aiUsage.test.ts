import assert from "node:assert/strict";
import {afterEach, test} from "node:test";
import {AI_USAGE_STORE_KEY, createAiUsageRecorder, getAiUsage} from "../main/helpers/aiUsage";
import {setStoreFactory} from "../main/handler/common/storeHandlers";
import {registerAiUsageHandlers} from "../main/handler/common/aiUsageHandlers";
import {openRouterChatCompletion, transcribeOpenRouterAudio, withRetries} from "../main/helpers/openRouterHttp";
import {AiResultCache} from "../renderer/utils/aiResultCache";
import {streamOpenRouterCompletion} from "../renderer/utils/openRouterClient";
import type {AiUsageSummary} from "../renderer/types/aiUsage";
import {dispatchInvoke, ipcMain, setEventSink} from "../renderer/platform/backend/shims/desktop";

const originalFetch = globalThis.fetch;
const originalWindow = (globalThis as Record<string, unknown>).window;
const originalWarn = console.warn;
afterEach(() => {
  globalThis.fetch = originalFetch;
  (globalThis as Record<string, unknown>).window = originalWindow;
  console.warn = originalWarn;
});

const memoryStore = (initial: unknown = undefined) => {
  let value = initial;
  return {
    get: (key: string) => { assert.equal(key, AI_USAGE_STORE_KEY); return value; },
    set: (key: string, next: unknown) => { assert.equal(key, AI_USAGE_STORE_KEY); value = next; }
  };
};

test("AI usage adds only actual finite nonnegative costs and counts missing prices separately", async () => {
  const store = memoryStore();
  const usage = createAiUsageRecorder(async () => store);
  await usage.record({cost: 0.125});
  await usage.record({cost: 0});
  for (const unknown of [undefined, {}, {cost: null}, {cost: "0.5"}, {cost: -1}, {cost: Infinity}, {cost: NaN}]) {
    await usage.record(unknown);
  }
  assert.deepEqual(await usage.get(), {observedCostUsd: 0.125, unpricedRequests: 7, totalRequests: 9});
});

test("AI usage persists between recorder instances and summaries cannot mutate stored totals", async () => {
  const store = memoryStore({observedCostUsd: 2, unpricedRequests: 3, totalRequests: 5});
  const first = createAiUsageRecorder(async () => store);
  const snapshot = await first.get();
  snapshot.observedCostUsd = 99;
  await first.record({cost: 0.5});
  const recreated = createAiUsageRecorder(async () => store);
  assert.deepEqual(await recreated.get(), {observedCostUsd: 2.5, unpricedRequests: 3, totalRequests: 6});
});

test("simultaneous responses do not lose increments while the persistent store opens or writes", async () => {
  const underlying = memoryStore();
  const recorder = createAiUsageRecorder(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1));
    return {
      get: underlying.get,
      set: async (key, value) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        underlying.set(key, value);
      }
    };
  });
  await Promise.all(Array.from({length: 20}, (_, index) => recorder.record(index % 2 ? undefined : {cost: 0.25})));
  assert.deepEqual(await recorder.get(), {observedCostUsd: 2.5, unpricedRequests: 10, totalRequests: 20});
});

test("failed writes do not poison future recording and subscribers receive isolated snapshots", async () => {
  const store = memoryStore();
  let fail = true;
  const recorder = createAiUsageRecorder(async () => ({
    get: store.get,
    set: (key, value) => {
      if (fail) throw new Error("disk unavailable");
      store.set(key, value);
    }
  }));
  await assert.rejects(recorder.record({cost: 1}), /disk unavailable/);
  fail = false;
  const changes: AiUsageSummary[] = [];
  const unsubscribe = recorder.subscribe((summary) => { changes.push({...summary}); summary.totalRequests = 100; });
  await recorder.record({cost: 0.5});
  unsubscribe();
  await recorder.record({cost: 0.25});
  assert.deepEqual(changes, [{observedCostUsd: 0.5, unpricedRequests: 0, totalRequests: 1}]);
  assert.deepEqual(await recorder.get(), {observedCostUsd: 0.75, unpricedRequests: 0, totalRequests: 2});
});

test("malformed persisted totals are normalized before new responses are recorded", async () => {
  const store = memoryStore({observedCostUsd: -2, unpricedRequests: 2.9, totalRequests: NaN});
  const recorder = createAiUsageRecorder(async () => store);
  assert.deepEqual(await recorder.get(), {observedCostUsd: 0, unpricedRequests: 2, totalRequests: 2});
  await recorder.record({cost: 0.1});
  assert.deepEqual(await recorder.get(), {observedCostUsd: 0.1, unpricedRequests: 2, totalRequests: 3});
});

const askBackend = () => openRouterChatCompletion({apiKey: "test-key", model: "test/model", messages: [{role: "user", content: "hello"}]});

test("new backend chat and ASR responses count once; explicit client rejections do not count", async () => {
  const store = memoryStore();
  setStoreFactory(async () => store);
  const responses = [
    {status: 200, body: {choices: [{message: {content: "hello"}}], usage: {cost: 0.01}}},
    {status: 401, body: {error: {code: 401, message: "bad key"}}},
    {status: 200, body: {error: {code: 402, message: "no credits"}}},
    {status: 200, body: {text: "transcribed", segments: [{start: 0, end: 1, text: "transcribed"}]}}
  ];
  globalThis.fetch = (async () => {
    const response = responses.shift();
    assert.ok(response);
    return new Response(JSON.stringify(response.body), {status: response.status});
  }) as typeof fetch;
  assert.equal((await askBackend()).content, "hello");
  await assert.rejects(askBackend(), /401/);
  await assert.rejects(askBackend(), /402/);
  await transcribeOpenRouterAudio({apiKey: "test-key", model: "test/asr", audioBase64: "YWJj", format: "mp3"});
  assert.equal(responses.length, 0);
  assert.deepEqual(await getAiUsage(), {observedCostUsd: 0.01, unpricedRequests: 1, totalRequests: 2});
});

test("usage storage errors never trigger a retry of a successful paid backend response", async () => {
  setStoreFactory(async () => ({get: () => undefined, set: () => { throw new Error("read-only store"); }}));
  let calls = 0;
  let warnings = 0;
  console.warn = () => { warnings++; };
  globalThis.fetch = (async () => {
    calls++;
    return new Response(JSON.stringify({choices: [{message: {content: "answer"}}], usage: {cost: 0.1}}));
  }) as typeof fetch;
  assert.equal((await withRetries(askBackend, {attempts: 3, delayMs: 0})).content, "answer");
  assert.equal(calls, 1);
  assert.equal(warnings, 1);
});

test("backend dispatch failures and unreadable terminal bodies record unknown costs once per request", async () => {
  const store = memoryStore();
  setStoreFactory(async () => store);
  globalThis.fetch = async () => { throw new TypeError("connection dropped"); };
  await assert.rejects(askBackend(), /connection dropped/);
  globalThis.fetch = async () => new Response("not JSON", {status: 200});
  await assert.rejects(askBackend(), /JSON/);
  globalThis.fetch = async () => new Response("upstream unavailable", {status: 503});
  await assert.rejects(askBackend(), /503/);
  globalThis.fetch = async () => new Response("rate limited", {status: 429});
  await assert.rejects(askBackend(), /429/);
  assert.deepEqual(await getAiUsage(), {observedCostUsd: 0, unpricedRequests: 3, totalRequests: 3});
});

test("backend cancellation after dispatch records an unknown charge while pre-cancellation records nothing", async () => {
  const store = memoryStore();
  setStoreFactory(async () => store);
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    return new Promise<Response>((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), {once: true}));
  };
  const abort = new AbortController();
  const pending = transcribeOpenRouterAudio({apiKey: "key", model: "test/asr", audioBase64: "YWJj", format: "mp3", signal: abort.signal});
  abort.abort();
  await assert.rejects(pending, /cancelled/i);
  await assert.rejects(transcribeOpenRouterAudio({apiKey: "key", model: "test/asr", audioBase64: "YWJj", format: "mp3", signal: abort.signal}), /cancelled/i);
  assert.equal(calls, 1);
  assert.deepEqual(await getAiUsage(), {observedCostUsd: 0, unpricedRequests: 1, totalRequests: 1});
});

test("each network retry contributes its own unknown request without duplicating the final observed cost", async () => {
  const store = memoryStore();
  setStoreFactory(async () => store);
  let calls = 0;
  globalThis.fetch = async () => {
    if (++calls < 3) throw new TypeError("connection dropped");
    return new Response(JSON.stringify({choices: [{message: {content: "answer"}}], usage: {cost: 0.2}}));
  };
  assert.equal((await withRetries(askBackend, {attempts: 3, delayMs: 0})).content, "answer");
  assert.deepEqual(await getAiUsage(), {observedCostUsd: 0.2, unpricedRequests: 2, totalRequests: 3});
});

const streamResponse = (cost?: number) => {
  const send = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`;
  const usage = {prompt_tokens: 5, completion_tokens: 2, total_tokens: 7, ...(cost === undefined ? {} : {cost})};
  return new Response(
    send({id: "test", model: "test", choices: [{index: 0, delta: {role: "assistant", content: "Hello "}, finish_reason: null}]})
    + send({id: "test", model: "test", choices: [{index: 0, delta: {content: "world"}, finish_reason: null}]})
    + send({id: "test", model: "test", choices: [{index: 0, delta: {content: ""}, finish_reason: "stop"}], usage})
    + "data: [DONE]\n\n",
    {status: 200, headers: {"Content-Type": "text/event-stream"}}
  );
};

test("renderer streams record actual terminal provider cost once and cached answers record nothing", async () => {
  const records: unknown[] = [];
  (globalThis as Record<string, unknown>).window = {backend: {invoke: async (channel: string, usage: unknown) => {
    assert.equal(channel, "ai-usage:record");
    records.push(usage);
  }}};
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return streamResponse(0.0025); }) as typeof fetch;
  const cache = new AiResultCache(5);
  const ask = () => streamOpenRouterCompletion("key", "test/stream", [{role: "user", content: "hello"}], {thinking: "off"});
  assert.equal(await cache.run("same-prompt", ask), "Hello world");
  assert.equal(await cache.run("same-prompt", ask), "Hello world");
  assert.equal(calls, 1);
  assert.deepEqual(records, [{cost: 0.0025}]);
});

test("a renderer stream without a provider charge reports an unknown price", async () => {
  const records: unknown[] = [];
  (globalThis as Record<string, unknown>).window = {backend: {invoke: async (_channel: string, usage: unknown) => { records.push(usage); }}};
  globalThis.fetch = (async () => streamResponse()) as typeof fetch;
  assert.equal(await streamOpenRouterCompletion("key", "test/no-cost", [{role: "user", content: "hello"}], {thinking: "off"}), "Hello world");
  assert.deepEqual(records, [{cost: undefined}]);
});

test("a rejected renderer request contributes no successful usage record", async () => {
  const records: unknown[] = [];
  (globalThis as Record<string, unknown>).window = {backend: {invoke: async (_channel: string, usage: unknown) => { records.push(usage); }}};
  globalThis.fetch = (async () => new Response(JSON.stringify({error: {code: 401, message: "bad key"}}), {status: 401})) as typeof fetch;
  await assert.rejects(streamOpenRouterCompletion("key", "test/rejected", [{role: "user", content: "hello"}], {thinking: "off"}));
  assert.deepEqual(records, []);
});

test("usage IPC reads persisted totals and broadcasts the updated snapshot after recording", async () => {
  const store = memoryStore({observedCostUsd: 0.5, unpricedRequests: 1, totalRequests: 2});
  setStoreFactory(async () => store);
  const events: {channel: string; args: unknown[]}[] = [];
  setEventSink((channel, args) => { events.push({channel, args}); });
  registerAiUsageHandlers();
  try {
    assert.deepEqual(await dispatchInvoke("ai-usage:get", []), {observedCostUsd: 0.5, unpricedRequests: 1, totalRequests: 2});
    assert.deepEqual(events, []);
    const changed = {observedCostUsd: 0.75, unpricedRequests: 1, totalRequests: 3};
    assert.deepEqual(await dispatchInvoke("ai-usage:record", [{cost: 0.25}]), changed);
    assert.deepEqual(events, [{channel: "ai-usage:changed", args: [changed]}]);
    assert.deepEqual(await dispatchInvoke("ai-usage:get", []), changed);
  } finally {
    ipcMain.removeHandler("ai-usage:get");
    ipcMain.removeHandler("ai-usage:record");
    setEventSink(() => undefined);
  }
});
