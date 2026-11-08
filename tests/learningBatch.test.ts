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
  const {dispatchInvoke} = await import("../renderer/platform/backend/shims/electron");
  Learning.registerHandler();
  await Learning.db.put("yue/𨋢", JSON.stringify({level: 2, updTime: 1}));
  await Learning.db.put("yue/𠺢嘛", JSON.stringify({level: 1, updTime: 2}));
  await Learning.db.put("yue/好", JSON.stringify({level: 3, updTime: 3}));

  const state = await dispatchInvoke("loadLearningState", ["yue"]) as Record<string, {level: number}>;

  assert.equal(state["𨋢"]?.level, 2);
  assert.equal(state["𠺢嘛"]?.level, 1);
  assert.equal(state["好"]?.level, 3);
});
