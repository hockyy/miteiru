import assert from "node:assert/strict";
import {test} from "node:test";
import {Store} from "../renderer/platform/backend/shims/store";
import {createFakeFs} from "./helpers/fakeSys";

const FILE = "C:/Users/test/AppData/Roaming/miteiru/config.json";

test("get falls back to the default and resolves dot paths", async () => {
  createFakeFs().files.set(FILE, JSON.stringify({font: {size: 14}, toneType: "mark"}));
  const store = await Store.open(FILE);
  assert.equal(store.get("toneType"), "mark");
  assert.equal(store.get("font.size"), 14);
  assert.equal(store.get("font.family", "Nunito"), "Nunito");
  assert.equal(store.get("missing.deep.path", 0), 0);
  assert.equal(store.get("font.size.nope", "d"), "d");
  assert.equal(store.has("font"), true);
  assert.equal(store.has("nothing"), false);
});

test("set creates nested objects, set(object) merges per key, delete removes a leaf", async () => {
  createFakeFs();
  const store = await Store.open(FILE);
  store.set("a.b.c", 1);
  store.set({"a.b.d": 2, top: true});
  assert.deepEqual(store.store, {a: {b: {c: 1, d: 2}}, top: true});
  store.delete("a.b.c");
  assert.deepEqual(store.store, {a: {b: {d: 2}}, top: true});
  store.set("a", "replaced");
  store.set("a.x", 1);
  assert.deepEqual(store.store, {a: {x: 1}, top: true});
});

test("changes are written once, debounced, as JSON at the config path (via a temp file and rename)", async () => {
  const fake = createFakeFs();
  const store = await Store.open(FILE);
  store.set("one", 1);
  store.set("two", {nested: [1, 2]});
  assert.equal(fake.files.has(FILE), false, "nothing is written before the debounce elapses");
  await store.flush();
  assert.deepEqual(JSON.parse(fake.files.get(FILE)), {one: 1, two: {nested: [1, 2]}});
  assert.equal(fake.files.has(`${FILE}.tmp`), false);
  assert.equal(fake.calls.filter((call) => call.cmd === "fs_rename").length, 1);
});

test("a second store opened afterwards sees what the first persisted", async () => {
  createFakeFs();
  const first = await Store.open(FILE);
  first.set("toneType", "num");
  first.set("deep.value", [1, 2, 3]);
  await first.flush();
  const second = await Store.open(FILE);
  assert.equal(second.get("toneType"), "num");
  assert.deepEqual(second.get("deep.value"), [1, 2, 3]);
});

test("a missing file starts empty and a corrupt one is set aside, not overwritten", async () => {
  const fake = createFakeFs();
  assert.deepEqual((await Store.open(FILE)).store, {});

  fake.files.set(FILE, "{not json");
  const store = await Store.open(FILE);
  assert.deepEqual(store.store, {});
  assert.equal(fake.files.get(`${FILE}.corrupt`), "{not json");
});
