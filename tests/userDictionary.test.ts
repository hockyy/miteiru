import assert from "node:assert/strict";
import {test} from "node:test";
import {
  analyzeWithUserDictionary,
  createUserDictionary,
  USER_DICTIONARY_ENABLED_KEY,
  USER_DICTIONARY_KEY,
  userDictionaryToken,
  userJapaneseDictionaryResult,
  userChineseDictionaryResult,
  validateUserDictionaryEntry,
  type UserDictionaryChange,
  type UserDictionaryEntry
} from "../main/helpers/userDictionary";
import {setStoreFactory} from "../main/handler/common/storeHandlers";
import {analyzeText} from "../main/handler/languages/analyzer";
import Japanese from "../main/handler/japanese";

const entry = (overrides: Partial<UserDictionaryEntry> = {}): UserDictionaryEntry => ({
  surface: "見ている", reading: "ミテイル", meaning: "watching", language: "ja", source: "manual", updatedAt: 0,
  ...overrides
});

const memory = (enabled = false) => {
  const values = new Map<string, unknown>([[USER_DICTIONARY_ENABLED_KEY, enabled]]);
  let writes = 0;
  return {
    values,
    writes: () => writes,
    store: {
      get: (key: string, fallback?: unknown) => values.has(key) ? values.get(key) : fallback,
      set: (key: string, value: unknown) => { writes++; values.set(key, value); }
    }
  };
};

test("dictionary validation normalizes and trims text and requires an explicit source", () => {
  assert.deepEqual(validateUserDictionaryEntry(entry({surface: " 見ている ", reading: " ミテイル ", meaning: " watching "}), 123),
    entry({updatedAt: 123}));
  const vietnamese = validateUserDictionaryEntry(entry({language: "vi", surface: " tiếng ", reading: "", meaning: "language"}), 5);
  assert.equal(vietnamese.surface, "tiếng");
  assert.equal(vietnamese.reading, "");
  assert.throws(() => validateUserDictionaryEntry({...entry(), source: undefined}), /source/);
  assert.throws(() => validateUserDictionaryEntry({...entry(), source: "imported"}), /source/);
  assert.throws(() => validateUserDictionaryEntry({...entry(), language: "en"}), /language/);
  for (const language of ["ja", "zh-CN", "yue"] as const) {
    assert.throws(() => validateUserDictionaryEntry(entry({language, reading: ""})), /reading/);
  }
});

test("dictionary field limits and control-character checks reject invalid entries", () => {
  for (const [field, maximum] of [["surface", 128], ["reading", 256], ["meaning", 1000]] as const) {
    assert.doesNotThrow(() => validateUserDictionaryEntry({...entry(), [field]: "a".repeat(maximum)}));
    assert.throws(() => validateUserDictionaryEntry({...entry(), [field]: "a".repeat(maximum + 1)}), new RegExp(field));
    assert.throws(() => validateUserDictionaryEntry({...entry(), [field]: "before\u0000after"}), new RegExp(field));
  }
});

test("AI additions are disabled by default while manual entries can still be managed", async () => {
  const database = memory();
  const changes: UserDictionaryChange[] = [];
  const dictionary = createUserDictionary({getStore: async () => database.store, now: () => 10, onChange: (change) => changes.push(change)});
  assert.deepEqual(await dictionary.upsert([entry({source: "ai"})]), {revision: 0, entries: []});
  assert.equal(database.writes(), 0);
  assert.deepEqual(changes, []);
  const saved = await dictionary.upsert([entry()]);
  assert.equal(saved.revision, 1);
  assert.equal(saved.entries[0].updatedAt, 10);
  assert.deepEqual(await dictionary.enabledEntries("ja"), []);
  database.values.set(USER_DICTIONARY_ENABLED_KEY, true);
  assert.equal((await dictionary.enabledEntries("ja"))[0].surface, "見ている");
  assert.deepEqual(await dictionary.enabledEntries("yue"), []);
  assert.deepEqual(await dictionary.enabledEntries("unsupported"), []);
});

test("AI updates preserve a manual correction, and manual edits can replace AI suggestions", async () => {
  const database = memory(true);
  const dictionary = createUserDictionary({getStore: async () => database.store});
  await dictionary.upsert([entry({source: "ai", meaning: "first suggestion"})]);
  await dictionary.upsert([entry({source: "manual", meaning: "my correction", reading: "みている"})]);
  const before = await dictionary.list();
  const after = await dictionary.upsert([entry({source: "ai", meaning: "replace correction", reading: "wrong"})]);
  assert.deepEqual(after, before);
  assert.equal(after.entries[0].meaning, "my correction");
  assert.equal(after.entries[0].source, "manual");
});

test("identical saves preserve revision and timestamp and emit no change event", async () => {
  const database = memory(true);
  let now = 1;
  const changes: UserDictionaryChange[] = [];
  const dictionary = createUserDictionary({getStore: async () => database.store, now: () => now, onChange: (change) => changes.push(change)});
  const first = await dictionary.upsert([entry()]);
  now = 2;
  assert.deepEqual(await dictionary.upsert([entry()]), first);
  assert.equal(changes.length, 1);
  assert.equal(database.writes(), 1);
  const updated = await dictionary.upsert([entry({meaning: "currently watching"})]);
  assert.equal(updated.revision, 2);
  assert.equal(updated.entries[0].updatedAt, 2);
  assert.deepEqual(changes, [
    {revision: 1, language: "ja", surfaces: ["見ている"]},
    {revision: 2, language: "ja", surfaces: ["見ている"]}
  ]);
});

test("batch changes identify affected surfaces per language and survive dictionary recreation", async () => {
  const database = memory(true);
  const changes: UserDictionaryChange[] = [];
  const dictionary = createUserDictionary({getStore: async () => database.store, now: () => 22, onChange: (change) => changes.push(change)});
  await dictionary.upsert([
    entry(),
    entry({surface: "東京", reading: "とうきょう", meaning: "Tokyo"}),
    entry({surface: "香港", reading: "hoeng1 gong2", meaning: "Hong Kong", language: "yue"})
  ]);
  assert.deepEqual(changes, [
    {revision: 1, language: "ja", surfaces: ["見ている", "東京"]},
    {revision: 1, language: "yue", surfaces: ["香港"]}
  ]);
  const restored = createUserDictionary({getStore: async () => database.store});
  assert.deepEqual(await restored.list(), await dictionary.list());
  assert.equal((await restored.list("ja")).entries.length, 2);
  assert.equal((await restored.list("yue")).entries.length, 1);
  await assert.rejects(restored.list("en"), /language/);
});

test("removal changes only the selected language and invalidates enabled entry groups", async () => {
  const database = memory(true);
  const changes: UserDictionaryChange[] = [];
  const dictionary = createUserDictionary({getStore: async () => database.store, onChange: (change) => changes.push(change)});
  await dictionary.upsert([
    entry({surface: "香港", language: "yue", reading: "hoeng1 gong2"}),
    entry({surface: "香港", language: "zh-CN", reading: "xiang1 gang3"})
  ]);
  assert.equal((await dictionary.enabledEntries("yue")).length, 1);
  const removed = await dictionary.remove("yue", " 香港 ");
  assert.equal(removed.revision, 2);
  assert.deepEqual(await dictionary.enabledEntries("yue"), []);
  assert.equal((await dictionary.enabledEntries("zh-CN")).length, 1);
  const count = changes.length;
  assert.deepEqual(await dictionary.remove("yue", "香港"), removed);
  assert.equal(changes.length, count);
  assert.deepEqual(changes.at(-1), {revision: 2, language: "yue", surfaces: ["香港"]});
});

test("a removed AI surface stays suppressed across forecasts and restarts until manually saved", async () => {
  const database = memory(true);
  const dictionary = createUserDictionary({getStore: async () => database.store});
  const suggestion = entry({source: "ai"});
  await dictionary.upsert([suggestion]);
  const removed = await dictionary.remove("ja", suggestion.surface);
  assert.deepEqual(removed.entries, []);
  assert.deepEqual(await dictionary.upsert([suggestion]), removed);
  const restored = createUserDictionary({getStore: async () => database.store});
  assert.deepEqual(await restored.upsert([suggestion]), removed);
  assert.deepEqual((database.values.get(USER_DICTIONARY_KEY) as {suppressions: unknown[]}).suppressions,
    [{language: "ja", surface: suggestion.surface}]);
  const saved = await restored.upsert([entry({meaning: "my restored definition"})]);
  assert.equal(saved.entries[0].source, "manual");
  assert.equal(saved.entries[0].meaning, "my restored definition");
  assert.deepEqual((database.values.get(USER_DICTIONARY_KEY) as {suppressions: unknown[]}).suppressions, []);
  assert.deepEqual(await restored.upsert([suggestion]), saved);
});

test("suppression is scoped to the removed language and legacy states remain writable", async () => {
  const database = memory(true);
  database.values.set(USER_DICTIONARY_KEY, {revision: 4, entries: [entry({surface: "香港", language: "yue", reading: "hoeng1 gong2", source: "ai"})]});
  const dictionary = createUserDictionary({getStore: async () => database.store});
  await dictionary.remove("yue", "香港");
  const added = await dictionary.upsert([
    entry({surface: "香港", language: "yue", reading: "hoeng1 gong2", source: "ai"}),
    entry({surface: "香港", language: "zh-CN", reading: "xiang1 gang3", source: "ai"})
  ]);
  assert.deepEqual(added.entries.map(({language}) => language), ["zh-CN"]);
});

test("a full suppression list rejects another removal without dropping an older choice", async () => {
  const database = memory(true);
  const suppressions = Array.from({length: 2000}, (_, index) => ({language: "ja", surface: `removed-${index}`}));
  database.values.set(USER_DICTIONARY_KEY, {revision: 7, entries: [entry({source: "ai"})], suppressions});
  const dictionary = createUserDictionary({getStore: async () => database.store});
  await assert.rejects(dictionary.remove("ja", "見ている"), /2000/);
  assert.equal((await dictionary.list()).entries.length, 1);
  assert.deepEqual((database.values.get(USER_DICTIONARY_KEY) as {suppressions: unknown[]}).suppressions, suppressions);
  await dictionary.upsert([entry({surface: "removed-0"})]);
  await dictionary.remove("ja", "見ている");
  assert.equal((database.values.get(USER_DICTIONARY_KEY) as {suppressions: unknown[]}).suppressions.length, 2000);
  const oversized = createUserDictionary({getStore: async () => ({get: () => ({entries: [], suppressions: [...suppressions, {language: "ja", surface: "extra"}]}), set: () => undefined})});
  await assert.rejects(oversized.list(), /2000/);
});

test("concurrent upserts preserve both entries and a failed validation does not poison later changes", async () => {
  const database = memory(true);
  const dictionary = createUserDictionary({getStore: async () => {
    await new Promise((resolve) => setTimeout(resolve, 1));
    return database.store;
  }});
  await Promise.all([
    dictionary.upsert([entry({surface: "東京", reading: "とうきょう"})]),
    dictionary.upsert([entry({surface: "大阪", reading: "おおさか"})])
  ]);
  assert.deepEqual((await dictionary.list()).entries.map((saved) => saved.surface).sort(), ["大阪", "東京"]);
  await assert.rejects(dictionary.upsert([{...entry(), source: "bad"}]), /source/);
  assert.equal((await dictionary.upsert([entry()])).revision, 3);
});

test("invalid imported records are excluded while valid persisted entries remain usable", async () => {
  const database = memory(true);
  database.values.set(USER_DICTIONARY_KEY, {revision: 8, entries: [entry(), {...entry(), surface: "bad\u0000word"}, {...entry(), language: "en"}]});
  const dictionary = createUserDictionary({getStore: async () => database.store});
  const saved = await dictionary.list();
  assert.equal(saved.revision, 8);
  assert.deepEqual(saved.entries, [entry()]);
});

test("dictionary overlay takes the longest phrase and delegates every unmatched span", async () => {
  const dictionaryEntries = [
    entry({surface: "東京", reading: "とうきょう", meaning: "Tokyo"}),
    entry({surface: "東京都", reading: "とうきょうと", meaning: "Tokyo Metropolis"})
  ];
  const unmatched: string[] = [];
  const tokens = await analyzeWithUserDictionary("前東京都後東京", "ja", dictionaryEntries, async (text) => {
    unmatched.push(text);
    return [{origin: text, normal: true}];
  });
  assert.deepEqual(unmatched, ["前", "後"]);
  assert.deepEqual(tokens.map((token) => token.origin), ["前", "東京都", "後", "東京"]);
  assert.equal(tokens[1].userDictionaryMeaning, "Tokyo Metropolis");
  assert.equal(tokens[3].userDictionaryMeaning, "Tokyo");
});

test("Vietnamese custom words respect Unicode letter and number boundaries", async () => {
  const vietnamese = entry({language: "vi", surface: "an", reading: "", meaning: "peace"});
  const tokens = await analyzeWithUserDictionary("ban an! an2", "vi", [vietnamese], (text) => [{origin: text}]);
  assert.deepEqual(tokens.map((token) => token.origin), ["ban ", "an", "! an2"]);
  assert.equal(tokens.filter((token) => token.userDictionaryId).length, 1);
});

test("an empty overlay delegates the original text once without changing default tokens", async () => {
  const normal = [{origin: "sentence", pos: "default"}];
  let calls = 0;
  const result = await analyzeWithUserDictionary("sentence", "ja", [], (text) => {
    calls++;
    assert.equal(text, "sentence");
    return normal;
  });
  assert.equal(result, normal);
  assert.equal(calls, 1);
});

test("dictionary tokens retain normal pronunciation fields and the custom meaning", () => {
  const japanese = userDictionaryToken(entry());
  assert.equal(japanese.origin, "見ている");
  assert.ok("basicForm" in japanese && "hiragana" in japanese);
  assert.equal(japanese.basicForm, "見ている");
  assert.equal(japanese.hiragana, "みている");
  assert.equal(japanese.userDictionaryMeaning, "watching");
  assert.equal(japanese.separation.map((part) => part.main).join(""), "見ている");
  const cantonese = userDictionaryToken(entry({language: "yue", surface: "香港", reading: "hoeng1 gong2", meaning: "Hong Kong"}), "symbol");
  assert.ok("jyutping" in cantonese);
  assert.equal(cantonese.jyutping, "hoeng1 gong2");
  assert.deepEqual(cantonese.separation.map((part) => part.main), ["香", "港"]);
  const mandarin = userDictionaryToken(entry({language: "zh-CN", surface: "你好", reading: "ni3 hao3", meaning: "hello"}), "symbol");
  assert.ok("pinyin" in mandarin);
  assert.equal(mandarin.pinyin, "nǐ hǎo");
  assert.deepEqual(mandarin.separation.map((part) => part.pinyin), ["nǐ", "hǎo"]);
  const vietnamese = userDictionaryToken(entry({language: "vi", surface: "học tập", reading: "", meaning: "study"}));
  assert.deepEqual(vietnamese.separation, [{main: "học"}, {main: "tập"}]);
});

test("the application's analyzer uses enabled custom entries without requiring a built-in dictionary lookup", async () => {
  const database = memory(true);
  database.values.set(USER_DICTIONARY_KEY, {revision: 1, entries: [entry({surface: "新造固有語", reading: "しんぞうこゆうご", meaning: "a personal coined term"})]});
  setStoreFactory(async () => database.store);
  const tokens = await analyzeText("新造固有語", {tokenizerMode: "kuromoji", toneType: "num"});
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].origin, "新造固有語");
  assert.equal(tokens[0].hiragana, "しんぞうこゆうご");
  assert.equal(tokens[0].userDictionaryMeaning, "a personal coined term");
});

test("the application's analyzer retains its built-in tokenizer while the custom dictionary is disabled", async () => {
  const database = memory(false);
  database.values.set(USER_DICTIONARY_KEY, {revision: 1, entries: [entry()]});
  setStoreFactory(async () => database.store);
  const original = Japanese.tokenizeUsingKuromoji;
  const calls: string[] = [];
  Japanese.tokenizeUsingKuromoji = async (text) => { calls.push(text); return []; };
  try {
    assert.deepEqual(await analyzeText("見ている", {tokenizerMode: "kuromoji"}), []);
    assert.deepEqual(calls, ["見ている"]);
  } finally {
    Japanese.tokenizeUsingKuromoji = original;
  }
});

test("custom lookup results preserve the Japanese and Chinese dictionary panel formats", () => {
  const japanese = userJapaneseDictionaryResult(entry());
  assert.equal(japanese.kanji[0].text, "見ている");
  assert.equal(japanese.kana[0].text, "みている");
  assert.deepEqual(japanese.sense[0].gloss, [{lang: "eng", text: "watching", type: null}]);
  assert.deepEqual(japanese.sense[0].info, ["User dictionary"]);
  const cantonese = userChineseDictionaryResult(entry({language: "yue", surface: "香港", reading: "hoeng1 gong2", meaning: "Hong Kong", source: "ai"}));
  assert.equal(cantonese.content, "香港");
  assert.equal(cantonese.jyutping, "hoeng1 gong2");
  assert.deepEqual(cantonese.meaning, ["Hong Kong"]);
});
