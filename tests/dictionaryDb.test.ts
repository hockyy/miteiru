import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {after, before, test} from "node:test";
import {Level} from "level";
import {getJmdictTags, kanjiBeginning, readingBeginning, setupJmdict} from "../main/dictionary/jmdictDb";
import {searchKanji, setupKanjidic} from "../main/dictionary/kanjidicDb";
import {charAnywhere, charBeginning, hanzi, setupChineseDictionary} from "../main/dictionary/chineseDictionaryDb";
import {allSubstrings, valuesWithPrefix} from "../main/dictionary/levelDictionary";

let directory: string;
const openDbs: { close: () => Promise<void> }[] = [];

before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "miteiru-dictionary-test-"));
});

after(async () => {
  await Promise.all(openDbs.splice(0).map((db) => db.close()));
  await fs.rm(directory, {recursive: true, force: true});
});

const writeJson = async (name: string, value: unknown) => {
  const file = path.join(directory, name);
  await fs.writeFile(file, JSON.stringify(value), "utf8");
  return file;
};

const track = <T extends { db: { close: () => Promise<void> } }>(setup: T) => {
  openDbs.push(setup.db);
  return setup;
};

const jmdictWord = (id: string, kanji: string[], kana: string[], gloss: string) => ({
  id,
  kanji: kanji.map((text) => ({common: true, text, tags: []})),
  kana: kana.map((text) => ({common: true, text, tags: [], appliesToKanji: ["*"]})),
  sense: [{partOfSpeech: ["v5r"], gloss: [{lang: "eng", text: gloss, type: null}]}],
});

const jmdictFile = {
  version: "3.6.1",
  dictDate: "2026-01-01",
  dictRevisions: [],
  tags: {v5r: "Godan verb with 'ru' ending"},
  words: [
    jmdictWord("1", ["成る"], ["なる"], "to become"),
    jmdictWord("2", ["鳴る"], ["なる"], "to sound"),
    jmdictWord("3", ["成程"], ["なるほど"], "I see"),
    jmdictWord("4", ["ＡＢＣ順"], ["エービーシーじゅん"], "alphabetical order"),
  ],
};

test("JMdict imports once and searches readings and kanji by prefix", async () => {
  const file = await writeJson("jmdict.json", jmdictFile);
  const dbPath = path.join(directory, "jmdict-db");
  const {db, version} = await setupJmdict(dbPath, file);

  assert.equal(version, "3.6.1");
  assert.deepEqual((await readingBeginning(db, "なる")).map((word) => word.id), ["1", "2", "3"]);
  assert.deepEqual((await readingBeginning(db, "なる", 2)).map((word) => word.id), ["1", "2"]);
  assert.deepEqual((await kanjiBeginning(db, "成")).map((word) => word.id), ["1", "3"]);
  assert.deepEqual((await kanjiBeginning(db, "ＡＢ")).map((word) => word.id), ["4"]);
  assert.deepEqual(await readingBeginning(db, "ぬ"), []);
  assert.deepEqual(await getJmdictTags(db), jmdictFile.tags);
  await db.close();

  await writeJson("jmdict.json", {...jmdictFile, version: "9.9.9", words: []});
  const reopened = track(await setupJmdict(dbPath, file));
  assert.equal(reopened.version, "3.6.1");
  assert.equal((await readingBeginning(reopened.db, "なる")).length, 3);
});

test("a dictionary whose import was interrupted is imported again", async () => {
  const dbPath = path.join(directory, "interrupted-jmdict-db");
  const partial = new Level<string, string>(dbPath);
  await partial.put("raw/words/1", "{}");
  await partial.close();

  const file = await writeJson("jmdict-again.json", jmdictFile);
  const {db} = track(await setupJmdict(dbPath, file));
  assert.equal((await readingBeginning(db, "なる")).length, 3);
});

const writeOldWrapperDb = async (dbPath: string) => {
  const db = new Level<string, string>(dbPath);
  await db.batch([
    {type: "put", key: "raw/dictDate", value: "2020-01-01"},
    {type: "put", key: "raw/version", value: "3.1.0"},
    {type: "put", key: "raw/words/1", value: JSON.stringify(jmdictWord("1", ["古"], ["ふる"], "old"))},
    {type: "put", key: "indexes/kana/ふる-1", value: "1"},
    {type: "put", key: "indexes/partial-kana/る-1", value: "1"},
  ]);
  await db.close();
};

test("a database built by the old wrappers is rebuilt once from the bundled file", async () => {
  const dbPath = path.join(directory, "old-wrapper-jmdict-db");
  await writeOldWrapperDb(dbPath);

  const file = await writeJson("jmdict-rebuild.json", jmdictFile);
  const {db, version} = track(await setupJmdict(dbPath, file));
  assert.equal(version, "3.6.1");
  assert.deepEqual(await readingBeginning(db, "ふる"), []);
  assert.equal(await db.get("indexes/partial-kana/る-1"), undefined);
  assert.equal((await readingBeginning(db, "なる")).length, 3);
});

test("an old but complete database is still used when its file is missing", async () => {
  const dbPath = path.join(directory, "old-wrapper-no-file-db");
  await writeOldWrapperDb(dbPath);

  const {db, version} = track(await setupJmdict(dbPath, path.join(directory, "nope.json")));
  assert.equal(version, "3.1.0");
  assert.deepEqual((await readingBeginning(db, "ふる")).map((word) => word.id), ["1"]);
});

test("a missing dictionary file rejects instead of exiting the app", async () => {
  await assert.rejects(
    setupJmdict(path.join(directory, "missing-db"), path.join(directory, "nope.json")),
    /Dictionary file not found/
  );
  await assert.rejects(setupKanjidic(path.join(directory, "missing-kanjidic-db")), /not imported/);
});

test("KANJIDIC looks up characters and returns undefined for unknown ones", async () => {
  const file = await writeJson("kanjidic.json", {
    version: "3.6.1",
    dictDate: "2026-01-01",
    characters: [{literal: "食", misc: {strokeCounts: [9]}}],
  });
  const {db} = track(await setupKanjidic(path.join(directory, "kanjidic-db"), file));

  assert.deepEqual(await searchKanji(db, "食"), {literal: "食", misc: {strokeCounts: [9]}});
  assert.equal(await searchKanji(db, "鬱"), undefined);
});

test("Chinese dictionary searches by prefix, anywhere and single character", async () => {
  const file = await writeJson("chinese.json", {
    version: "1.0.0",
    words: [
      {id: "0", content: "我們", simplified: "我们", meaning: ["we"]},
      {id: "1", content: "我們的", simplified: "我们的", meaning: ["our"]},
      {id: "2", content: "一𠹻風", simplified: "", meaning: ["gust"]},
      {id: "3", content: "pat", simplified: "", meaning: ["to pat"]},
    ],
    characters: [{id: "0", content: "我", meaning: ["I"]}],
  });
  const {db} = track(await setupChineseDictionary(path.join(directory, "chinese-db"), file));

  assert.deepEqual((await charBeginning(db, "我們")).map((word) => word.id), ["0", "1"]);
  assert.deepEqual((await charBeginning(db, "我们")).map((word) => word.id), ["0", "1"]);
  // One hit per matching substring key, as before; queryChinese removes the duplicates.
  const anywhereIds = async (text: string) => [...new Set((await charAnywhere(db, text)).map((word) => word.id))];
  assert.deepEqual(await anywhereIds("們的"), ["1"]);
  assert.deepEqual(await anywhereIds("𠹻"), ["2"]);
  assert.deepEqual((await charBeginning(db, "pa")).map((word) => word.id), ["3"]);
  assert.deepEqual((await hanzi(db, "我")).map((character) => character.content), ["我"]);
});

test("Chinese characters that reuse an id keep their own records", async () => {
  const file = await writeJson("cantodict-characters.json", {
    version: "1.0.0",
    words: [],
    characters: [
      {id: "0", content: "我", jyutping: ["ngo5"]},
      {id: "1", content: "四", jyutping: ["sei3"]},
      {id: "0", content: "⺀", meaning: ["ice"]},
    ],
  });
  const {db} = track(await setupChineseDictionary(path.join(directory, "duplicate-ids-db"), file));

  assert.deepEqual((await hanzi(db, "我", 1))[0], {id: "0", content: "我", jyutping: ["ngo5"]});
  assert.deepEqual((await hanzi(db, "⺀", 1))[0], {id: "0", content: "⺀", meaning: ["ice"]});
  assert.equal((await hanzi(db, "四", 1))[0].content, "四");
});

test("valuesWithPrefix returns every key under the prefix, including astral continuations", async () => {
  const db = new Level<string, string>(path.join(directory, "prefix-db"));
  openDbs.push(db);
  await db.batch(["indexes/pa-1", "indexes/pat-2", "indexes/pb-3", "indexes/pa𠹻-4", "indexes/paＡ-5"]
    .map((key) => ({type: "put" as const, key, value: key.slice(-1)})));

  assert.deepEqual(await valuesWithPrefix(db, "indexes/pa"), ["1", "2", "5", "4"]);
  assert.deepEqual(await valuesWithPrefix(db, "indexes/pa", 2), ["1", "2"]);
  assert.deepEqual(await valuesWithPrefix(db, "indexes/q"), []);
});

test("allSubstrings keeps astral characters whole", () => {
  assert.deepEqual([...allSubstrings("一𠹻")], ["一", "一𠹻", "𠹻"]);
});
