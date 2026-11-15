import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {after, before, test} from "node:test";
import {Level} from "level";
import Learning from "../main/handler/learning";

let directory: string;

before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "miteiru-learning-test-"));
  Learning.db = new Level(directory);
});

after(async () => {
  await Learning.db.close();
  await fs.rm(directory, {recursive: true, force: true});
});

const read = async (key: string) => {
  const value = await Learning.db.get(key).catch(() => undefined);
  return value === undefined ? undefined : JSON.parse(value);
};

test("updateContentBatch has written every newer entry when it resolves", async () => {
  await Learning.db.put("ja/食べる", JSON.stringify({level: 1, updTime: 100}));
  await Learning.db.put("ja/見る", JSON.stringify({level: 3, updTime: 500}));

  await Learning.updateContentBatch({
    "食べる": {level: 2, updTime: 200},
    "見る": {level: 0, updTime: 300},
    "書く": {level: 1, updTime: 50},
  }, "ja");

  assert.deepEqual(await read("ja/食べる"), {level: 2, updTime: 200});
  assert.deepEqual(await read("ja/見る"), {level: 3, updTime: 500});
  assert.deepEqual(await read("ja/書く"), {level: 1, updTime: 50});
});

test("updateContentBatch replaces entries still stored in the old numeric format", async () => {
  await Learning.db.put("ja/走る", "2");

  await Learning.updateContentBatch({"走る": {level: 3, updTime: 10}}, "ja");

  assert.deepEqual(await read("ja/走る"), {level: 3, updTime: 10});
});

test("loadLearningState returns words whose first character is outside the BMP", async () => {
  const {dispatchInvoke} = await import("../renderer/platform/backend/shims/desktop");
  Learning.registerHandler();
  await Learning.db.put("yue/𨋢", JSON.stringify({level: 2, updTime: 1}));
  await Learning.db.put("yue/𠺢嘛", JSON.stringify({level: 1, updTime: 2}));
  await Learning.db.put("yue/好", JSON.stringify({level: 3, updTime: 3}));

  const state = await dispatchInvoke("loadLearningState", ["yue"]) as Record<string, {level: number}>;

  assert.equal(state["𨋢"]?.level, 2);
  assert.equal(state["𠺢嘛"]?.level, 1);
  assert.equal(state["好"]?.level, 3);
});

// Bug fix: loadState rewrote old-format entries while reading, so tools that only read saved words
// (the MCP's analyze_text, list_saved_words, known_words) wrote to the store.
test("loadState reads old-format entries without writing them back", async () => {
  await Learning.db.put("vi/xin chào", "2");
  await Learning.db.put("vi/cảm ơn", JSON.stringify({level: 1, updTime: 40}));
  const writes: string[] = [];
  const put = Learning.db.put.bind(Learning.db);
  Learning.db.put = (async (key: string, value: string) => {
    writes.push(key);
    return put(key, value);
  }) as typeof Learning.db.put;
  try {
    assert.deepEqual(await Learning.loadState("vi"), {"cảm ơn": {level: 1, updTime: 40}, "xin chào": {level: 2, updTime: 0}});
  } finally {
    Learning.db.put = put as typeof Learning.db.put;
  }
  assert.deepEqual(writes, []);
  assert.equal(await Learning.db.get("vi/xin chào"), "2");
});

test("parseEntry reads both formats and treats garbage as New with no edit time", () => {
  assert.deepEqual(Learning.parseEntry(JSON.stringify({level: 2, updTime: 9})), {level: 2, updTime: 9});
  assert.deepEqual(Learning.parseEntry("1"), {level: 1, updTime: 0});
  assert.deepEqual(Learning.parseEntry(JSON.stringify({level: 2})), {level: 2, updTime: 0});
  assert.deepEqual(Learning.parseEntry("{\"level\": \"x\"}"), {level: 0, updTime: 0});
  assert.deepEqual(Learning.parseEntry("nonsense"), {level: 0, updTime: 0});
});
