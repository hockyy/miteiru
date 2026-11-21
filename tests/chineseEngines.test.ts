import assert from "node:assert/strict";
import {test} from "node:test";
import Chinese, {cantoneseEngine, chineseEngine, mandarinEngine, sentencePinyin} from "../main/handler/chinese";
import {analyzeText} from "../main/handler/languages/analyzer";
import {languagePlugins, loadLanguageEngine, loadLanguagePlugin} from "../main/handler/languages/registry";
import {setStoreFactory} from "../main/handler/common/storeHandlers";
import type {LanguagePlugin} from "../main/handler/languages/types";

const noUserWords = () => setStoreFactory(async () => ({get: (_key: string, fallback?: unknown) => fallback, set: () => undefined}));

const fakeJieba = (words: string[]) => ({cutTagged: async () => words.map(s => ({s})), setUserWords: async () => undefined});

test("Mandarin and Cantonese have an engine each; the analyzer reads each mode's own", async () => {
  noUserWords();
  const saved = {mandarin: mandarinEngine.jieba, cantonese: cantoneseEngine.jieba, active: Chinese.active};
  try {
    assert.notEqual(mandarinEngine, cantoneseEngine);
    assert.equal(chineseEngine("yue"), cantoneseEngine);
    assert.equal(chineseEngine("zh-CN"), mandarinEngine);
    mandarinEngine.jieba = fakeJieba(["你", "好"]);
    cantoneseEngine.jieba = fakeJieba(["佢哋"]);
    mandarinEngine.userWords = undefined;
    cantoneseEngine.userWords = undefined;
    // The word popup's language is Cantonese, yet Mandarin text is still read by the Mandarin engine.
    Chinese.active = cantoneseEngine;
    assert.deepEqual((await analyzeText("你好", {tokenizerMode: "jieba"})).map((token) => token.origin), ["你", "好"]);
    assert.deepEqual((await analyzeText("佢哋", {tokenizerMode: "cantonese"})).map((token) => token.origin), ["佢哋"]);
    // The facade's members reach the active engine; choosing a language code switches it.
    assert.equal(Chinese.jieba, cantoneseEngine.jieba);
    Chinese.languageCode = "zh-CN";
    assert.equal(Chinese.active, mandarinEngine);
  } finally {
    mandarinEngine.jieba = saved.mandarin;
    cantoneseEngine.jieba = saved.cantonese;
    Chinese.active = saved.active;
  }
});

test("Mandarin pinyin is read in its sentence: 了 after a verb is le, not liǎo", async () => {
  noUserWords();
  const saved = mandarinEngine.jieba;
  try {
    mandarinEngine.jieba = fakeJieba(["我", "吃", "了", "饭"]);
    mandarinEngine.userWords = undefined;
    const numbers: any[] = await mandarinEngine.tokenizeUsingJieba("我吃了饭", "num");
    assert.deepEqual(numbers.map((token) => token.pinyin), ["wo3", "chi1", "le5", "fan4"]);
    const marks: any[] = await mandarinEngine.tokenizeUsingJieba("我吃了饭", "symbol");
    assert.deepEqual(marks.map((token) => token.pinyin), ["wǒ", "chī", "le", "fàn"]);
    // A word keeps one reading per character, from the same sentence-wide read.
    mandarinEngine.jieba = fakeJieba(["没想到", "，", "龙王"]);
    const words: any[] = await mandarinEngine.tokenizeUsingJieba("没想到，龙王", "num");
    assert.deepEqual(words.map((token) => token.separation.map((part) => part.pinyin)), [["mei2", "xiang3", "dao4"], [""], ["long2", "wang2"]]);
  } finally {
    mandarinEngine.jieba = saved;
  }
});

test("Traditional Mandarin is read through its simplified copy: 我們 is wǒ men, 什麼 is shén me", async () => {
  noUserWords();
  const saved = mandarinEngine.jieba;
  try {
    mandarinEngine.jieba = fakeJieba(["我們", "今天", "說", "什麼", "？"]);
    mandarinEngine.userWords = undefined;
    const numbers: any[] = await mandarinEngine.tokenizeUsingJieba("我們今天說什麼？", "num");
    // The words and their characters stay traditional; only the reading comes from the simplified copy.
    assert.deepEqual(numbers.map((token) => token.origin), ["我們", "今天", "說", "什麼", "？"]);
    assert.deepEqual(numbers.map((token) => token.pinyin), ["wo3 men5", "jin1 tian1", "shuo1", "shen2 me5", ""]);
    assert.deepEqual(numbers[0].separation.map((part) => part.main), ["我", "們"]);
    assert.deepEqual((await sentencePinyin("頭髮很長")).map((read) => `${read.origin}${read.pinyin}`), ["頭tou2", "髮fa0", "很hen3", "長chang2"]);
  } finally {
    mandarinEngine.jieba = saved;
  }
});

test("loadLanguageEngine sets a language up once for the tools and never changes the learner's language", async () => {
  let setups = 0;
  let homeSetups = 0;
  let ready = false;
  let key = "data-1";
  const plugin: LanguagePlugin = {
    id: "test-engine",
    kind: "language",
    name: "Test",
    tokenizerMode: "test-mode",
    setup: async () => { homeSetups++; ready = true; },
    setupEngine: async () => { setups++; ready = true; },
    engineKey: async () => key,
    engineReady: () => ready
  };
  languagePlugins.push(plugin);
  try {
    assert.deepEqual(await loadLanguageEngine("test-engine", {appDataDirectory: "/profile"}), {ok: 1, message: "Setup is ready"});
    await loadLanguageEngine("test-engine", {appDataDirectory: "/profile"});
    assert.equal(setups, 1, "a ready engine with the same data is not set up again");
    // Its data changed (a new pack): set up again.
    key = "data-2";
    await loadLanguageEngine("test-engine", {appDataDirectory: "/profile"});
    assert.equal(setups, 2);
    // Closed (a dictionary cache removal): set up again.
    ready = false;
    await loadLanguageEngine("test-engine", {appDataDirectory: "/profile"});
    assert.equal(setups, 3);
    // Home's load runs its own setup and sets the tokenizer; a tools load after it reuses that.
    const tokenizers: string[] = [];
    await loadLanguagePlugin("test-engine", {appDataDirectory: "/profile", setTokenizer: (mode) => tokenizers.push(mode)});
    assert.deepEqual(tokenizers, ["test-mode"]);
    assert.equal(homeSetups, 1);
    await loadLanguageEngine("test-engine", {appDataDirectory: "/profile"});
    assert.equal(setups, 3);
    assert.deepEqual(await loadLanguageEngine("missing-engine", {appDataDirectory: "/profile"}), {ok: 0, message: "Unknown language plugin: missing-engine"});
  } finally {
    languagePlugins.splice(languagePlugins.indexOf(plugin), 1);
  }
});
