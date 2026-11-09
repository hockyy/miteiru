import assert from "node:assert/strict";
import {test} from "node:test";
import Chinese from "../main/handler/chinese";
import {analyzeText} from "../main/handler/languages/analyzer";
import {setStoreFactory} from "../main/handler/common/storeHandlers";
import {USER_DICTIONARY_ENABLED_KEY, USER_DICTIONARY_KEY} from "../main/helpers/userDictionary";
import {Jieba} from "../renderer/platform/backend/shims/jieba";
import {setSys} from "../renderer/platform/backend/sys";

test("native shim sends dictionary path and replaces a user-only overlay", async () => {
  const calls: unknown[] = [];
  setSys(async (command, args) => { calls.push({command, args}); return command === "jieba_cut" ? ["星際薯片"] : undefined; });
  try {
    const tokenizer = await Jieba.withDictFile("/pack/zh.jieba.txt", "/pack/chinese.json");
    await tokenizer.setUserWords([{surface: "星際薯片", source: "manual"}]);
    assert.deepEqual(await tokenizer.cut("星際薯片"), ["星際薯片"]);
    assert.deepEqual(calls, [
      {command: "jieba_load", args: {key: "dict:/pack/zh.jieba.txt", dictPath: "/pack/zh.jieba.txt", dictionaryPath: "/pack/chinese.json"}},
      {command: "jieba_user_words", args: {key: "dict:/pack/zh.jieba.txt", words: [{surface: "星際薯片", source: "manual"}]}},
      {command: "jieba_cut", args: {key: "dict:/pack/zh.jieba.txt", text: "星際薯片", hmm: true}}
    ]);
  } finally { setSys(async () => { throw new Error("No system bridge"); }); }
});

for (const language of ["zh-CN", "yue"] as const) {
  test(`${language}: analyzes the whole line, refreshes on change, and preserves saved presentation`, async () => {
    const values = new Map<string, unknown>([[USER_DICTIONARY_ENABLED_KEY, true]]);
    const saved = {surface: "星際薯片", reading: language === "yue" ? "sing1 zai3 syu4 pin2" : "xing1 ji4 shu3 pian4",
      meaning: "space crisps", language, source: "manual", updatedAt: 0};
    values.set(USER_DICTIONARY_KEY, {revision: 1, entries: [saved]});
    setStoreFactory(async () => ({get: (key, fallback) => values.has(key) ? values.get(key) : fallback, set: (key, value) => { values.set(key, value); }}));
    const previous = {jieba: Chinese.jieba, languageCode: Chinese.languageCode, userWords: Chinese.userWords};
    const calls: string[] = [];
    const updates: unknown[] = [];
    let hasWord = false;
    Chinese.languageCode = language;
    Chinese.userWords = undefined;
    Chinese.jieba = {setUserWords: async (words) => { updates.push(words); hasWord = words.length > 0; },
      cut: async (line) => { calls.push(line); return hasWord ? ["我", "愛", "星際薯片"] : ["我", "愛", "星際", "薯片"]; }};
    const options = {tokenizerMode: language === "yue" ? "cantonese" : "jieba", toneType: "symbol"};
    try {
      const first = await analyzeText("我愛星際薯片", options);
      assert.deepEqual(calls, ["我愛星際薯片"]);
      assert.equal(first.at(-1).userDictionaryMeaning, saved.meaning);
      assert.equal(first.at(-1).userDictionarySource, "manual");
      assert.ok(first.at(-1)[language === "yue" ? "jyutping" : "pinyin"]);
      await analyzeText("我愛星際薯片", options);
      assert.equal(updates.length, 1);
      values.set(USER_DICTIONARY_KEY, {revision: 2, entries: [], suppressions: [{surface: saved.surface, language}]});
      assert.equal((await analyzeText("我愛星際薯片", options)).length, 4);
      assert.deepEqual(updates.at(-1), []);
      values.set(USER_DICTIONARY_KEY, {revision: 3, entries: [{...saved, source: "ai"}]});
      await analyzeText("我愛星際薯片", options);
      values.set(USER_DICTIONARY_ENABLED_KEY, false);
      assert.equal((await analyzeText("我愛星際薯片", options)).length, 4);
      assert.deepEqual(updates.at(-1), []);
      const disabledUpdates = updates.length;
      await analyzeText("我愛星際薯片", options);
      assert.equal(updates.length, disabledUpdates);
      values.set(USER_DICTIONARY_ENABLED_KEY, true);
      values.set(USER_DICTIONARY_KEY, {revision: 4, entries: [saved], suppressions: [{surface: saved.surface, language}]});
      assert.equal((await analyzeText("我愛星際薯片", options)).length, 4);
    } finally { Object.assign(Chinese, previous); }
  });
}
