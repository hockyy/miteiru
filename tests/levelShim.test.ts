import assert from "node:assert/strict";
import {test} from "node:test";
import {Level} from "../renderer/platform/backend/shims/level";
import {createFakeKv} from "./helpers/fakeSys";

const open = async (entries: Record<string, string> = {}) => {
  const kv = createFakeKv();
  const db = new Level<string, string>("jmdict-db");
  await db.batch(Object.entries(entries).map(([key, value]) => ({type: "put" as const, key, value})));
  return {db, kv};
};

test("get returns undefined for a missing key, like level 10; getOrThrow throws LEVEL_NOT_FOUND", async () => {
  const {db} = await open({a: "1"});
  assert.equal(await db.get("a"), "1");
  assert.equal(await db.get("missing"), undefined);
  await assert.rejects(db.getOrThrow("missing"), (error: Error & { code?: string; notFound?: boolean }) => (
    error.code === "LEVEL_NOT_FOUND" && error.notFound === true
  ));
  assert.deepEqual(await db.getMany(["a", "missing"]), ["1", undefined]);
});

test("put, del and batch apply to the store", async () => {
  const {db} = await open();
  await db.put("k", "v");
  assert.equal(await db.get("k"), "v");
  await db.batch([{type: "put", key: "a", value: "1"}, {type: "del", key: "k"}]);
  assert.equal(await db.get("k"), undefined);
  assert.equal(await db.get("a"), "1");
  await db.del("a");
  assert.equal(await db.get("a"), undefined);
});

test("operations wait for the open and fail after close", async () => {
  const {db, kv} = await open({a: "1"});
  assert.equal(db.status, "open");
  await db.close();
  assert.equal(db.status, "closed");
  await assert.rejects(db.get("a"), (error: Error & { code?: string }) => error.code === "LEVEL_DATABASE_NOT_OPEN");
  assert.ok(kv.calls.some((call) => call.cmd === "kv_close"));
});

test("iterator honors gte/lt ranges, limit and reverse", async () => {
  const {db} = await open({"x/1": "a", "x/2": "b", "x/3": "c", "y/1": "d"});
  assert.deepEqual(await db.iterator({gte: "x/", lt: "x/\u{10FFFF}"}).all(), [["x/1", "a"], ["x/2", "b"], ["x/3", "c"]]);
  assert.deepEqual(await db.iterator({gt: "x/1", lte: "x/3"}).all(), [["x/2", "b"], ["x/3", "c"]]);
  assert.deepEqual(await db.iterator({gte: "x/", lte: "x/￿", limit: 2}).all(), [["x/1", "a"], ["x/2", "b"]]);
  assert.deepEqual(await db.iterator({reverse: true, limit: 2}).all(), [["y/1", "d"], ["x/3", "c"]]);
  assert.deepEqual(await db.keys({gte: "x/"}).all(), ["x/1", "x/2", "x/3", "y/1"]);
  assert.deepEqual(await db.values({gte: "x/2", lt: "y/", limit: -1}).all(), ["b", "c"]);
});

test("for await pages through a range in chunks of 5000 without skipping or repeating", async () => {
  const entries: Record<string, string> = {};
  for (let index = 0; index < 12345; index++) entries[`k/${String(index).padStart(6, "0")}`] = String(index);
  const {db, kv} = await open(entries);
  kv.calls.length = 0;

  const seen: string[] = [];
  for await (const [key, value] of db.iterator({gte: "k/", lt: "k/\u{10FFFF}"})) {
    assert.equal(Number(value), seen.length);
    seen.push(key);
  }
  assert.equal(seen.length, 12345);
  const ranges = kv.calls.filter((call) => call.cmd === "kv_range");
  assert.equal(ranges.length, 3);
  assert.ok(ranges.every((call) => (call.args.opts as { limit: number }).limit === 5000));
  // The second page starts after the last key of the first, and keeps the caller's upper bound.
  assert.deepEqual(ranges[1].args.opts, {gt: "k/004999", lt: "k/\u{10FFFF}", limit: 5000, reverse: false, keys: true, values: true});
});

test("a limit smaller than a page is passed through and paging stops there", async () => {
  const entries: Record<string, string> = {};
  for (let index = 0; index < 20; index++) entries[`k${String(index).padStart(2, "0")}`] = String(index);
  const {db, kv} = await open(entries);
  kv.calls.length = 0;
  assert.equal((await db.iterator({limit: 7}).all()).length, 7);
  const ranges = kv.calls.filter((call) => call.cmd === "kv_range");
  assert.equal(ranges.length, 1);
  assert.equal((ranges[0].args.opts as { limit: number }).limit, 7);
});

test("reverse paging walks down from the upper bound", async () => {
  const entries: Record<string, string> = {};
  for (let index = 0; index < 6000; index++) entries[`k${String(index).padStart(4, "0")}`] = String(index);
  const {db} = await open(entries);
  const keys = await db.keys({reverse: true, gte: "k0100", lte: "k5999"}).all();
  assert.equal(keys.length, 5900);
  assert.equal(keys[0], "k5999");
  assert.equal(keys.at(-1), "k0100");
});

test("clear removes just the range", async () => {
  const {db} = await open({a: "1", b: "2", c: "3"});
  await db.clear({gte: "b"});
  assert.deepEqual(await db.keys().all(), ["a"]);
});

test("batches travel as raw bytes that decode to the same writes", async () => {
  const {encodeBatch} = await import("../renderer/platform/backend/shims/level");
  const {decodeKvBatch} = await import("./helpers/fakeSys");
  const ops = [
    {type: "put" as const, key: "raw/words/1", value: "{\"id\":\"1\",\"text\":\"食べる\"}"},
    {type: "del" as const, key: "indexes/kana/たべる-1"},
    {type: "put" as const, key: "", value: ""},
    // 3 bytes per UTF-16 unit (the most the encoder makes room for), and 4 bytes per surrogate pair.
    {type: "put" as const, key: "語".repeat(5000), value: "🍣🍣"}
  ];
  assert.deepEqual(decodeKvBatch(encodeBatch(ops)), ops);
  assert.throws(() => encodeBatch([{type: "put", key: "k"}]), (error: Error & { code?: string }) => error.code === "EINVAL");
  assert.throws(() => encodeBatch([{type: "get" as "put", key: "k"}]), (error: Error & { code?: string }) => error.code === "EINVAL");
});
