import assert from "node:assert/strict";
import {test} from "node:test";
import {limiter} from "../main/helpers/limiter";

const deferred = () => {
  let resolve: () => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return {promise, resolve, reject};
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("a limiter runs at most its size at once, and the rest in the order they came", async () => {
  const limit = limiter(2);
  const gates = [deferred(), deferred(), deferred(), deferred()];
  const started: number[] = [];
  let running = 0;
  let most = 0;
  const runs = gates.map((gate, index) => limit(async () => {
    started.push(index);
    most = Math.max(most, ++running);
    await gate.promise;
    running--;
    return index;
  }));
  await tick();
  assert.deepEqual(started, [0, 1]);
  gates[1].resolve();
  await tick();
  assert.deepEqual(started, [0, 1, 2]);
  gates[0].resolve();
  gates[2].resolve();
  gates[3].resolve();
  assert.deepEqual(await Promise.all(runs), [0, 1, 2, 3]);
  assert.equal(most, 2);
});

test("a failed task frees its place for the next one", async () => {
  const limit = limiter(1);
  const failing = limit(async () => { throw new Error("no"); });
  const next = limit(async () => "next");
  await assert.rejects(failing, /no/);
  assert.equal(await next, "next");
});

test("a task that frees its place hands it on, so a newcomer can't jump the queue", async () => {
  const limit = limiter(1);
  const first = deferred();
  const order: string[] = [];
  const a = limit(async () => { await first.promise; order.push("a"); });
  const b = limit(async () => { order.push("b"); });
  first.resolve();
  // Asked for in the same moment the first one finishes: it still goes after b.
  const c = limit(async () => { order.push("c"); });
  await Promise.all([a, b, c]);
  assert.deepEqual(order, ["a", "b", "c"]);
});
