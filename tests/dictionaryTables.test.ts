import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {after, before, test} from "node:test";
import {charAnywhere, charBeginning, chineseImport, hanzi, setupChineseDictionary} from "../main/dictionary/chineseDictionaryDb";
import {jmdictImport, getJmdictTags, kanjiBeginning, readingBeginning, setupJmdict} from "../main/dictionary/jmdictDb";
import {kanjidicImport, searchKanji, setupKanjidic} from "../main/dictionary/kanjidicDb";
import {FORMAT_KEY, valuesWithPrefix, type DictionaryDb} from "../main/dictionary/levelDictionary";
import {chineseLearningGloss, japaneseLearningGloss, queryChineseDictionary, searchJapanese} from "../main/handler/languages/learningGlosses";
import {buildDictionaryTable} from "../scripts/data/buildDictionaryTables";
import {writeTable} from "../scripts/data/writeTable";
import {openReadOnlyTable} from "../renderer/platform/backend/shims/level";
import {setSys} from "../renderer/platform/backend/sys";
import {clearTableCaches, get as getRow, scan as scanRows} from "../main/helpers/dataTable";

let directory: string;
const open: DictionaryDb[] = [];

before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "miteiru-dictionary-table-test-"));
});

after(async () => {
  await Promise.all(open.splice(0).map((db) => db.close()));
  await fs.rm(directory, {recursive: true, force: true});
});

const SOURCE = {name: "Test", url: "https://example.test/", license: "CC0"};

const word = (id: string, kanji: string[], kana: string[], gloss: string, common = true) => ({
  id,
  kanji: kanji.map((text) => ({common, text, tags: []})),
  kana: kana.map((text) => ({common, text, tags: [], appliesToKanji: ["*"]})),
  sense: [{
    partOfSpeech: ["n"], appliesToKanji: [], appliesToKana: [], related: [], antonym: [], field: [], dialect: [],
    misc: [], info: [], languageSource: [], gloss: [{lang: "eng", text: gloss, type: null}]
  }]
});

const jmdictJson = {
  version: "3.6.1", dictDate: "2026-01-01", dictRevisions: ["1.0"], tags: {n: "noun"},
  words: [
    word("1", ["成る"], ["なる"], "to become"),
    word("2", ["鳴る"], ["なる"], "to sound"),
    word("3", ["成程"], ["なるほど"], "I see"),
    word("4", ["ＡＢＣ順"], ["エービーシーじゅん"], "alphabetical order"),
    word("5", ["人"], ["ひと", "ひと"], "person (human)"),
    word("6", ["人形", "ひと形"], ["にんぎょう"], "doll"),
    word("7", ["日本"], ["にほん", "にっぽん"], "Japan"),
    word("8", ["日本語"], ["にほんご"], "Japanese"),
    word("9", ["𠮷野"], ["よしの"], "Yoshino"),
    word("10", [], ["コーヒー"], "coffee"),
    word("11", ["猫"], ["ねこ"], "cat"),
    word("12", ["猫舌"], ["ねこじた"], "sensitive to hot food")
  ]
};

const kanjidicJson = {
  version: "1.0", dictDate: "2026-01-01",
  characters: [{literal: "日", misc: {strokeCounts: [4]}}, {literal: "本", misc: {strokeCounts: [5]}}, {literal: "𠮷", misc: {}}]
};

const chineseJson = {
  version: "2026-01-01",
  words: [
    {id: "0", content: "我們", simplified: "我们", meaning: ["we"]},
    {id: "1", content: "我們的", simplified: "我们的", meaning: ["our", "ours"]},
    {id: "2", content: "中國", simplified: "中国", meaning: ["China"]},
    {id: "3", content: "中國人", simplified: "中国人", meaning: ["Chinese person"]},
    {id: "4", content: "一𠹻風", simplified: "", meaning: ["gust"]},
    {id: "5", content: "pat", simplified: "", meaning: ["to pat"]},
    {id: "6", content: "pa1", simplified: "", meaning: ["percent"]},
    {id: "7", content: "人", simplified: "", meaning: ["person"]}
  ],
  characters: [
    {id: "0", content: "我", meaning: ["I"]},
    {id: "1", content: "中", meaning: ["middle"]},
    {id: "0", content: "⺀", meaning: ["ice"]}
  ]
};

/** The JSON twice: once with a built table beside it, once alone (so it is imported into `level`). */
const fixture = async (name: string, json: unknown, definition: typeof jmdictImport | typeof kanjidicImport | typeof chineseImport) => {
  const withTable = path.join(directory, `${name}-table`, `${name}.json`);
  const imported = path.join(directory, `${name}-import`, `${name}.json`);
  for (const file of [withTable, imported]) {
    await fs.mkdir(path.dirname(file), {recursive: true});
    await fs.writeFile(file, JSON.stringify(json));
  }
  const built = await buildDictionaryTable(withTable, definition as never, {dataset: `test/${name}`, source: SOURCE});
  return {withTable, imported, built, dbPath: (kind: string) => path.join(directory, `${name}-${kind}-db`)};
};

/** Every 1 to 3 character prefix (by code point) of the strings. */
const prefixes = (texts: string[]) => {
  const found = new Set<string>(["", "pa", "x", "ー", "\u{10FFFF}"]);
  for (const text of texts) {
    const chars = Array.from(text);
    for (let length = 1; length <= Math.min(3, chars.length); length++) found.add(chars.slice(0, length).join(""));
  }
  return [...found];
};

const LIMITS = [-1, 0, 1, 5];

test("a built table reports its provenance and every entry of the import", async () => {
  const {built} = await fixture("jmdict-meta", jmdictJson, jmdictImport);
  assert.ok(built.entries > 40 && built.blocks >= 1);
  const table = path.join(directory, "jmdict-meta-table", "jmdict-meta.pack");
  const {header} = await (await import("../main/helpers/dataTable")).openTable(table);
  assert.equal(header.dataset, "test/jmdict-meta");
  assert.equal(header.version, "3.6.1 2026-01-01");
  assert.deepEqual(header.source, SOURCE);
  assert.equal((await getRow(table, FORMAT_KEY))?.toString(), "1");
  // Duplicate keys (a word listing the same reading twice) collapse, as writes to a store do.
  assert.equal((await getRow(table, "indexes/kana/ひと-5"))?.toString(), "5");
});

test("JMdict reads the same from a table as from the imported store", async () => {
  const {withTable, imported, dbPath} = await fixture("jmdict", jmdictJson, jmdictImport);
  const fromTable = await setupJmdict(dbPath("table"), withTable);
  const fromImport = await setupJmdict(dbPath("import"), imported);
  open.push(fromTable.db, fromImport.db);
  assert.equal(fromTable.version, fromImport.version);
  assert.equal(fromTable.dictDate, fromImport.dictDate);
  assert.deepEqual(await getJmdictTags(fromTable.db), await getJmdictTags(fromImport.db));

  const readings = jmdictJson.words.flatMap((entry) => entry.kana.map((kana) => kana.text));
  const spellings = jmdictJson.words.flatMap((entry) => entry.kanji.map((kanji) => kanji.text));
  let compared = 0;
  for (const limit of LIMITS) {
    for (const prefix of prefixes([...readings, ...spellings])) {
      for (const search of [readingBeginning, kanjiBeginning]) {
        assert.deepEqual(await search(fromTable.db, prefix, limit), await search(fromImport.db, prefix, limit), `${search.name}(${prefix}, ${limit})`);
        compared++;
      }
      assert.deepEqual(
        await valuesWithPrefix(fromTable.db, `indexes/kana/${prefix}`, limit),
        await valuesWithPrefix(fromImport.db, `indexes/kana/${prefix}`, limit)
      );
    }
  }
  assert.ok(compared > 100);
  // Spot checks that the comparison compares something.
  assert.deepEqual((await readingBeginning(fromTable.db, "なる", 2)).map((entry) => entry.id), ["1", "2"]);
  assert.deepEqual((await kanjiBeginning(fromTable.db, "𠮷")).map((entry) => entry.id), ["9"]);
  assert.deepEqual(await readingBeginning(fromTable.db, "なる", 0), []);

  for (const query of ["日本", "日", "人", "猫", "なる", "にほん", "ねこ", "𠮷野", "none"]) {
    for (const limit of [-1, 1, 5]) {
      assert.deepEqual(await searchJapanese(fromTable.db, query, limit), await searchJapanese(fromImport.db, query, limit), `${query} ${limit}`);
    }
  }
  for (const entry of jmdictJson.words) {
    for (const target of [...entry.kanji.map((kanji) => kanji.text), ...entry.kana.map((kana) => kana.text)]) {
      for (const reading of ["", entry.kana[0].text]) {
        assert.equal(
          await japaneseLearningGloss(fromTable.db, {target, reading}),
          await japaneseLearningGloss(fromImport.db, {target, reading}),
          `${target} ${reading}`
        );
      }
    }
  }
  assert.equal(await japaneseLearningGloss(fromTable.db, {target: "猫", reading: "ねこ"}), "cat");
});

test("KANJIDIC reads the same from a table as from the imported store", async () => {
  const {withTable, imported, dbPath} = await fixture("kanjidic", kanjidicJson, kanjidicImport);
  const fromTable = await setupKanjidic(dbPath("table"), withTable);
  const fromImport = await setupKanjidic(dbPath("import"), imported);
  open.push(fromTable.db, fromImport.db);
  assert.equal(fromTable.version, fromImport.version);
  for (const literal of ["日", "本", "𠮷", "鬱", ""]) {
    assert.deepEqual(await searchKanji(fromTable.db, literal), await searchKanji(fromImport.db, literal), literal);
  }
  assert.deepEqual(await searchKanji(fromTable.db, "日"), {literal: "日", misc: {strokeCounts: [4]}});
});

test("Chinese dictionaries read the same from a table as from the imported store", async () => {
  const {withTable, imported, dbPath} = await fixture("chinese", chineseJson, chineseImport);
  const fromTable = await setupChineseDictionary(dbPath("table"), withTable);
  const fromImport = await setupChineseDictionary(dbPath("import"), imported);
  open.push(fromTable.db, fromImport.db);
  assert.equal(fromTable.version, fromImport.version);

  const forms = chineseJson.words.flatMap((entry) => [entry.content, entry.simplified]).filter(Boolean);
  const characters = chineseJson.characters.map((character) => character.content);
  for (const limit of LIMITS) {
    for (const prefix of prefixes([...forms, ...characters])) {
      assert.deepEqual(await charBeginning(fromTable.db, prefix, limit), await charBeginning(fromImport.db, prefix, limit), `charBeginning ${prefix} ${limit}`);
      assert.deepEqual(await charAnywhere(fromTable.db, prefix, limit), await charAnywhere(fromImport.db, prefix, limit), `charAnywhere ${prefix} ${limit}`);
      assert.deepEqual(await hanzi(fromTable.db, prefix, limit), await hanzi(fromImport.db, prefix, limit), `hanzi ${prefix} ${limit}`);
    }
  }
  for (const query of ["中国", "中國", "们的", "𠹻", "pa", "人", "none"]) {
    for (const limit of [1, 3, 5]) {
      assert.deepEqual(await queryChineseDictionary(fromTable.db, query, limit), await queryChineseDictionary(fromImport.db, query, limit), `${query} ${limit}`);
    }
  }
  for (const target of ["中国", "中國", "我们", "人", "pat", "none"]) {
    assert.equal(await chineseLearningGloss(fromTable.db, {target}), await chineseLearningGloss(fromImport.db, {target}), target);
  }
  assert.deepEqual((await charBeginning(fromTable.db, "pa")).map((entry) => entry.id), ["6", "5"]);
  assert.equal((await hanzi(fromTable.db, "⺀", 1))[0].content, "⺀");
});

test("a table without its format marker is refused, not replaced by an import", async () => {
  const json = path.join(directory, "broken", "broken.json");
  await fs.mkdir(path.dirname(json), {recursive: true});
  await fs.writeFile(json, JSON.stringify(kanjidicJson));
  writeTable(path.join(path.dirname(json), "broken.pack"), {dataset: "test/broken", version: "1", codec: "text", source: SOURCE}, [
    ["raw/characters/日", Buffer.from("{}")], ["raw/dictDate", Buffer.from("d")], ["raw/version", Buffer.from("v")]
  ]);
  await assert.rejects(setupKanjidic(path.join(directory, "broken-db"), json), /no complete format marker/);
  await assert.rejects(fs.access(path.join(directory, "broken-db")), "nothing was imported");
});

test("opening a table removes the four-dictionary legacy caches and nothing else", async () => {
  const {withTable} = await fixture("legacy", jmdictJson, jmdictImport);
  const store = path.join(directory, "legacy-appdata");
  await fs.mkdir(store, {recursive: true});
  const touch = async (file: string) => {
    await fs.mkdir(path.dirname(file), {recursive: true});
    await fs.writeFile(file, "x");
  };
  const dictionaryDb = path.join(store, "jmdict-db");
  await touch(path.join(dictionaryDb, "CURRENT"));
  await touch(path.join(dictionaryDb, "000005.ldb"));
  for (const suffix of ["", "-wal", "-shm"]) await touch(`${dictionaryDb}.sqlite3${suffix}`);
  // Learning data sits in the same folder and must survive, in both of its forms.
  const learning = path.join(store, "learning-db");
  await touch(path.join(learning, "CURRENT"));
  for (const suffix of ["", "-wal", "-shm"]) await touch(`${learning}.sqlite3${suffix}`);
  await touch(path.join(store, "kanjidic-db-notes.sqlite3"));
  // A folder at a dictionary path that is not a LevelDB folder is left alone.
  const odd = path.join(store, "cccedict-db");
  await touch(path.join(odd, "mine.txt"));

  const {db} = await setupJmdict(dictionaryDb, withTable);
  open.push(db);
  const left = (await fs.readdir(store)).sort();
  assert.deepEqual(left, ["cccedict-db", "kanjidic-db-notes.sqlite3", "learning-db", "learning-db.sqlite3", "learning-db.sqlite3-shm", "learning-db.sqlite3-wal"]);
  assert.deepEqual((await fs.readdir(learning)), ["CURRENT"]);
  assert.equal((await readingBeginning(db, "なる")).length, 3);
});

test("an import starts from an empty store: the old SQLite file goes with the folder", async () => {
  const json = path.join(directory, "rebuild", "jmdict.json");
  await fs.mkdir(path.dirname(json), {recursive: true});
  await fs.writeFile(json, JSON.stringify(jmdictJson));
  const dbPath = path.join(directory, "rebuild-db");
  for (const suffix of ["", "-wal", "-shm"]) await fs.writeFile(`${dbPath}.sqlite3${suffix}`, "stale");
  const {db} = await setupJmdict(dbPath, json);
  open.push(db);
  for (const suffix of ["", "-wal", "-shm"]) await assert.rejects(fs.access(`${dbPath}.sqlite3${suffix}`));
  assert.equal((await readingBeginning(db, "なる")).length, 3);
});

test("the desktop shim's table store answers like the reader, in one call per query", async () => {
  const {withTable} = await fixture("shim", jmdictJson, jmdictImport);
  const table = withTable.replace(/\.json$/, ".pack");
  const calls: string[] = [];
  const handles = new Map<number, string>();
  setSys(async (cmd, args = {}) => {
    calls.push(cmd);
    switch (cmd) {
      case "table_open": handles.set(1, args.path as string); return 1;
      case "table_close": handles.delete(args.handle as number); return null;
      case "table_get_many": return Promise.all((args.keys as string[]).map(async (key) => (await getRow(handles.get(args.handle as number)!, key))?.toString() ?? null));
      case "table_values": {
        const limit = args.limit as number;
        if (limit === 0) return [];
        const rows = await scanRows(handles.get(args.handle as number)!, {gte: args.gte as string ?? undefined, lt: args.lt as string ?? undefined, limit: limit < 0 ? undefined : limit});
        return rows.map(([, value]) => value.toString());
      }
      default: throw new Error(`unexpected ${cmd}`);
    }
  });
  clearTableCaches();
  const store = await openReadOnlyTable(table);
  assert.equal(await store.get("raw/dictDate"), "2026-01-01");
  assert.equal(await store.get("nope"), undefined);
  assert.deepEqual(await store.getMany(["raw/version", "nope"]), ["3.6.1", undefined]);
  assert.deepEqual(await store.getMany([]), []);
  const before = calls.length;
  const prefix = "indexes/kana/な";
  assert.deepEqual(await store.values({gte: prefix, lt: `${prefix}\u{10FFFF}`, limit: 2}).all(), ["1", "2"]);
  assert.equal(calls.length - before, 1);
  assert.deepEqual(await store.values({gte: prefix, lt: `${prefix}\u{10FFFF}`, limit: 0}).all(), []);
  assert.equal((await store.values({gte: prefix, lt: `${prefix}\u{10FFFF}`}).all()).length, 3);
  await store.close();
  await assert.rejects(store.get("raw/version"), (error: Error & { code?: string }) => error.code === "LEVEL_DATABASE_NOT_OPEN");
  await store.close();
  assert.equal(calls.filter((call) => call === "table_close").length, 1);
});

test("staging turns each dictionary's JSON into a table, removes the JSON and its gzip, and a rerun keeps the tables", async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const {compressLanguageAssets} = require("../scripts/compressLanguageAssets.js");
  const app = path.join(directory, "staged-app");
  const root = path.join(app, "language-assets");
  const files: Record<string, unknown> = {
    "japanese/dict/jmdict.json": jmdictJson,
    "japanese/dict/kanjidic.json": kanjidicJson,
    "mandarin/chinese/chinese.json": chineseJson,
    "cantonese/cantonese/cantodict.json": chineseJson
  };
  for (const [relative, json] of Object.entries(files)) {
    const file = path.join(root, relative);
    await fs.mkdir(path.dirname(file), {recursive: true});
    await fs.writeFile(file, JSON.stringify(json));
  }
  await fs.writeFile(path.join(root, "japanese/dict/jmdict.json.gz"), "stale");

  assert.equal(compressLanguageAssets(app).files, 4);
  for (const relative of Object.keys(files)) {
    await fs.access(path.join(root, relative.replace(/\.json$/, ".pack")));
    await assert.rejects(fs.access(path.join(root, relative)));
    await assert.rejects(fs.access(path.join(root, `${relative}.gz`)));
  }
  const jmdict = await setupJmdict(path.join(directory, "staged-jm-db"), path.join(root, "japanese/dict/jmdict.json"));
  open.push(jmdict.db);
  assert.equal(jmdict.version, "3.6.1");
  assert.equal((await readingBeginning(jmdict.db, "なる")).length, 3);
  const canto = await setupChineseDictionary(path.join(directory, "staged-canto-db"), path.join(root, "cantonese/cantonese/cantodict.json"));
  open.push(canto.db);
  assert.equal((await charBeginning(canto.db, "中国", 5)).length, 2);

  assert.equal(compressLanguageAssets(app).files, 0);
  await fs.access(path.join(root, "japanese/dict/jmdict.pack"));
});
