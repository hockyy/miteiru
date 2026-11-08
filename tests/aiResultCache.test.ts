import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AiResultCache,
  isAbortError,
  makeAiCacheKey,
} from "../renderer/utils/aiResultCache";

const delay = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

test("a repeated request is answered from the cache", async () => {
  const cache = new AiResultCache(10);
  let calls = 0;
  const task = async () => ++calls;
  assert.equal(await cache.run("a", task), 1);
  assert.equal(await cache.run("a", task), 1);
  assert.equal(calls, 1);
});

test("identical requests in flight share one task and one stream of text", async () => {
  const cache = new AiResultCache(10);
  let calls = 0;
  let release!: (value: string) => void;
  let emit!: (text: string) => void;
  const task = ({ onText }: { onText: (text: string) => void }) => {
    calls++;
    emit = onText;
    return new Promise<string>((resolve) => { release = resolve; });
  };
  const first: string[] = [];
  const second: string[] = [];
  const a = cache.run("k", task, { onText: (t) => first.push(t) });
  await delay();
  emit("par");
  const b = cache.run("k", task, { onText: (t) => second.push(t) });
  emit("partial");
  release("done");
  assert.deepEqual(await Promise.all([a, b]), ["done", "done"]);
  assert.equal(calls, 1);
  assert.deepEqual(first, ["par", "partial"]);
  assert.deepEqual(second, ["par", "partial"]); // joined late, caught up first
});

test("evicts the least recently used entry", async () => {
  const cache = new AiResultCache(2);
  await cache.run("a", async () => 1);
  await cache.run("b", async () => 2);
  await cache.run("a", async () => 99); // touch a
  await cache.run("c", async () => 3);
  assert.equal(cache.size, 2);
  assert.ok(cache.has("a"));
  assert.ok(!cache.has("b"));
  assert.ok(cache.has("c"));
});

test("errors are not cached", async () => {
  const cache = new AiResultCache(10);
  await assert.rejects(cache.run("a", async () => { throw new Error("boom"); }), /boom/);
  assert.ok(!cache.has("a"));
  assert.equal(await cache.run("a", async () => "ok"), "ok");
});

test("an aborted request rejects, cancels the task and is not cached", async () => {
  const cache = new AiResultCache(10);
  const controller = new AbortController();
  let taskSignal: AbortSignal | undefined;
  const task = ({ signal }: { signal: AbortSignal }) => {
    taskSignal = signal;
    return new Promise<string>((resolve) => setTimeout(() => resolve("late"), 20));
  };
  const promise = cache.run("a", task, { signal: controller.signal });
  await delay();
  controller.abort();
  await assert.rejects(promise, (error) => isAbortError(error));
  assert.equal(taskSignal?.aborted, true);
  await delay(40);
  assert.ok(!cache.has("a"));
  await assert.rejects(cache.run("a", task, { signal: controller.signal }), (error) => isAbortError(error));
});

test("the shared task keeps running while one caller remains", async () => {
  const cache = new AiResultCache(10);
  const one = new AbortController();
  let taskSignal!: AbortSignal;
  const task = ({ signal }: { signal: AbortSignal }) => {
    taskSignal = signal;
    return new Promise<string>((resolve) => setTimeout(() => resolve("shared"), 10));
  };
  const a = cache.run("k", task, { signal: one.signal });
  const b = cache.run("k", task);
  await delay();
  one.abort();
  await assert.rejects(a, (error) => isAbortError(error));
  assert.equal(await b, "shared");
  assert.equal(taskSignal.aborted, false);
  assert.ok(cache.has("k"));
});

test("cache keys separate everything that changes the prompt", () => {
  const base = makeAiCacheKey("translation", "m", "ja", ["  hello "], { formal: true });
  assert.equal(base, makeAiCacheKey("translation", "m", "ja", ["hello"], { formal: true }));
  assert.notEqual(base, makeAiCacheKey("translation", "m", "ja", ["hello"], { formal: false }));
  assert.notEqual(base, makeAiCacheKey("translation", "m2", "ja", ["hello"], { formal: true }));
  assert.notEqual(base, makeAiCacheKey("translation", "m", "zh", ["hello"], { formal: true }));
  assert.notEqual(base, makeAiCacheKey("analysis", "m", "ja", ["hello"], { formal: true }));
  assert.notEqual(base, makeAiCacheKey("translation", "m", "ja", ["hello", "x"], { formal: true }));
});