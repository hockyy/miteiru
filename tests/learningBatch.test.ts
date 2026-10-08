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
