import assert from "node:assert/strict";
import {afterEach, beforeEach, describe, it} from "node:test";
import {keepLanguageAcrossReloads} from "../renderer/platform/tauriBridge";

const KEY = "miteiru.loadedLanguage";

describe("keeping the language across reloads", () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    (globalThis as {sessionStorage?: unknown}).sessionStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    };
  });

  afterEach(() => {
    delete (globalThis as {sessionStorage?: unknown}).sessionStorage;
  });

  it("remembers a language only when it loaded", async () => {
    const results: Record<string, unknown> = {loadChinese: {ok: 0, message: "no"}, loadKuromoji: {ok: 1}};
    const call = keepLanguageAcrossReloads(async (channel) => results[channel]);
    await call("loadChinese", []);
    assert.equal(store.get(KEY), undefined);
    await call("loadKuromoji", []);
    assert.equal(store.get(KEY), "loadKuromoji");
    await call("loadChinese", []);
    assert.equal(store.get(KEY), "loadKuromoji");
  });

  it("makes a language picked after a reload wait for the restore", async () => {
    store.set(KEY, "loadKuromoji");
    const order: string[] = [];
    let finishRestore: () => void = () => {};
    const call = keepLanguageAcrossReloads(async (channel) => {
      order.push(`start ${channel}`);
      if (channel === "loadKuromoji") await new Promise<void>((resolve) => { finishRestore = resolve; });
      order.push(`end ${channel}`);
      return {ok: 1};
    });
    const picked = call("loadChinese", []);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(order, ["start loadKuromoji"]);
    finishRestore();
    await picked;
    assert.deepEqual(order, ["start loadKuromoji", "end loadKuromoji", "start loadChinese", "end loadChinese"]);
    assert.equal(store.get(KEY), "loadChinese");
  });
});
