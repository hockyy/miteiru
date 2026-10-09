import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {test} from "node:test";
import {readingBeginning, setupJmdict, type JmdictWord} from "../main/dictionary/jmdictDb";
import {rankJapaneseMatches, searchJapanese} from "../main/handler/languages/learningGlosses";

// Entries trimmed to what the ranking reads; those with seven-digit ids are copied from JMdict. A
// trailing * marks a common spelling or reading; each sense is its parts of speech.
const word = (id: string, kanji: string[], kana: string[], senses: string[][]): JmdictWord => {
  const element = (text: string) => ({common: text.endsWith("*"), text: text.replace(/\*$/, ""), tags: []});
  return {
    id,
    kanji: kanji.map(element),
    kana: kana.map((text) => ({...element(text), appliesToKanji: ["*"]})),
    sense: senses.map((partOfSpeech) => ({
      partOfSpeech, appliesToKanji: [], appliesToKana: [], related: [], antonym: [], field: [], dialect: [],
      misc: [], info: [], languageSource: [], gloss: [{lang: "eng", text: `${id}`, type: null}]
    }))
  };
};

const first = (matches: JmdictWord[], query: string) => rankJapaneseMatches(matches, query)[0]?.id;

// Every order of the input must give the same first result.
const assertFirstInAnyOrder = (matches: JmdictWord[], query: string, expected: string) => {
  for (let shift = 0; shift < matches.length; shift++) {
    const rotated = [...matches.slice(shift), ...matches.slice(0, shift)];
    assert.equal(first(rotated, query), expected, `${query}: ${rotated.map(({id}) => id).join(",")}`);
    assert.equal(first([...rotated].reverse(), query), expected, `${query} reversed`);
  }
};

const IRU = [
  word("1322180", ["射る*"], ["いる*"], [["v1", "vt"]]),
  word("1391500", ["炒る", "煎る"], ["いる"], [["v5r", "vt"]]),
  word("1465580", ["入る*"], ["いる*"], [["v5r", "vi"], ["v5r", "vi"], ["v5r", "vi"], ["suf", "v5r"], ["suf", "v5r"]]),
  word("1546640", ["要る*"], ["いる*"], [["v5r", "vi"]]),
  word("1577980", ["居る*"], ["いる*"], [["v1", "vi"], ["v1", "vi"], ["v1", "aux-v"]]),
  word("1587780", ["鋳る*"], ["いる*"], [["v1", "vt"]]),
  word("2729170", ["癒る"], ["いる"], [["v1", "vi"]])
];

test("a kana query puts the word with a grammar use first, then the one with most senses", () => {
  // いる as in ている is 居る; of the other common いる verbs, 入る has the most senses.
  assertFirstInAnyOrder(IRU, "いる", "1577980");
  assert.equal(rankJapaneseMatches(IRU, "いる")[1].id, "1465580");
  assertFirstInAnyOrder([
    word("1298670", ["刷る*", "摺る"], ["する*"], [["v5r", "vt"], ["v5r", "vt"]]),
    word("1595910", ["擦る*", "摩る"], ["する*"], [["v5r", "vt"], ["v5r", "vt"]]),
    word("1157170", ["為る"], ["する*"], [["vs-i"], ["vs-i"], ["vs-i", "vt"], ["suf", "vs-i"], ["aux-v", "vs-i"]])
  ], "する", "1157170");
  assertFirstInAnyOrder([
    word("1269130", ["呉れる"], ["くれる*"], [["v1-s", "vt"], ["v1-s", "vt"], ["aux-v", "v1-s"], ["aux-v", "v1-s"]]),
    word("1514960", ["暮れる*", "眩れる"], ["くれる*"], [["v1", "vi"], ["v1", "vi"], ["v1", "vi"]])
  ], "くれる", "1269130");
  // No grammar use: the noun with ten senses (物) beats 者 and the sentence-final particle.
  assertFirstInAnyOrder([
    word("1322990", ["者*"], ["もの*", "もん"], [["n"]]),
    word("1502390", ["物*"], ["もの*", "もん"], [["n"], ["n"], ["n"], ["n"], ["n"], ["n"], ["n-suf"], ["n-suf"], ["pref"], ["pref"]]),
    word("2780660", [], ["もの*", "もん"], [["prt"], ["prt"]])
  ], "もの", "1502390");
});

test("the exact reading or spelling must itself be common", () => {
  // この is a rare reading of 九; the common この is 此の.
  assertFirstInAnyOrder([
    word("1578150", ["九*", "玖"], ["きゅう*", "く*", "ここの", "この"], [["num"]]),
    word("1582920", ["此の", "斯の"], ["この*"], [["adj-pn"], ["adj-pn"], ["adj-pn"]])
  ], "この", "1582920");
  // 前 is a rare spelling of 先 (さき); the common 前 words are まえ and ぜん.
  assertFirstInAnyOrder([
    word("1387210", ["先*", "前", "先き"], ["さき*"], [["n"], ["n"], ["n"], ["n"], ["n", "adj-no"], ["n"], ["n"], ["n"], ["n"]]),
    word("1392570", ["前*"], ["ぜん*"], [["n-pref"], ["n-pref"], ["n-suf"], ["n", "adv"]]),
    word("1392580", ["前*"], ["まえ*"], [["n"], ["n", "adj-no", "adv"], ["n", "adj-no"], ["n"], ["suf"], ["n"]])
  ], "前", "1392580");
  // A common word never beats one spelled or read exactly as the query, even an archaic one.
  assertFirstInAnyOrder([
    word("2571360", ["怡々"], ["いい"], [["adj-t", "adv-to"]]),
    word("1188430", [], ["いいえ*"], [["int"]])
  ], "いい", "2571360");
  assertFirstInAnyOrder([
    word("2571360", ["怡々"], ["いい"], [["adj-t", "adv-to"]]),
    word("2672300", ["謂"], ["いい"], [["n"]]),
    word("2820690", [], ["いい*"], [["adj-ix"], ["adj-ix"], ["adj-ix"], ["adj-ix"]])
  ], "いい", "2820690");
});

test("a kanji query skips affixes and counters, then keeps JMdict's order", () => {
  // 人: じん "-ian" and と are suffixes, にん a counter; the word is ひと.
  assertFirstInAnyOrder([
    word("1366410", ["人*"], ["じん*"], [["suf"], ["suf"], ["suf"]]),
    word("1366420", ["人"], ["と"], [["suf"]]),
    word("1580640", ["人*"], ["ひと*"], [["n"], ["n"], ["n"]]),
    word("2149890", ["人*"], ["にん*"], [["ctr"]])
  ], "人", "1580640");
  // No 処 spelling is common; the word ところ still beats the suffix -どころ, though 処 is its main spelling.
  assertFirstInAnyOrder([
    word("1343100", ["所*", "処"], ["ところ*"], [["n", "adv", "suf"], ["n", "suf"]]),
    word("2837167", ["処"], ["どころ"], [["n-suf"]])
  ], "処", "1343100");
  // JMdict lists the native reading first: 心 is こころ before しん, though しん has more senses.
  assertFirstInAnyOrder([
    word("1360480", ["心*"], ["こころ*"], [["n"], ["n"]]),
    word("1595125", ["心*"], ["しん*"], [["n"], ["n"], ["n"], ["n"], ["n"], ["n"]])
  ], "心", "1360480");
  // 後 is a rare spelling of 後ろ and 尻; of the words written 後 it is あと, listed first.
  assertFirstInAnyOrder([
    word("1269320", ["後*"], ["あと*"], [["n", "adj-no"], ["n", "adv"]]),
    word("1269330", ["後*", "后"], ["のち*"], [["n", "adv", "adj-no"]]),
    word("1269410", ["後ろ*", "後"], ["うしろ*"], [["n", "adj-no"]]),
    word("1358760", ["尻*", "臀", "後"], ["しり*"], [["n"], ["n"], ["n"], ["n"]]),
    word("2147630", ["後*"], ["ご*"], [["n", "n-suf", "adv"]])
  ], "後", "1269320");
});

test("a word whose main spelling is the query beats one that merely has it as a variant", () => {
  // 尤も is a rare spelling of 最も "most" and the only spelling of 尤も "but then"; neither 尤も is
  // common, and JMdict order alone would pick 最も.
  assertFirstInAnyOrder([
    word("1293700", ["最も*", "尤も"], ["もっとも*", "もとも"], [["adv"]]),
    word("1535810", ["尤も"], ["もっとも*"], [["conj"], ["adj-na", "n"]])
  ], "尤も", "1535810");
});

test("among equally good matches the shorter headword comes first, then JMdict order", () => {
  const prefixed = [
    word("1", ["人工知能*"], ["じんこうちのう*"], [["n"]]),
    word("2", ["人形*"], ["にんぎょう*"], [["n"]]),
    word("3", ["人間*"], ["にんげん*"], [["n"]])
  ];
  assert.deepEqual(rankJapaneseMatches(prefixed, "人").map(({id}) => id), ["2", "3", "1"]);
});

test("exact matches come before longer words that start with the query", () => {
  const matches = [
    word("1", [], ["ちょっとずつ*"], [["adv"], ["adv"], ["adv"]]),
    word("2", [], ["ちょっと*"], [["adv"]]),
    word("3", [], ["ちょっとした*"], [["adj-pn"]])
  ];
  assert.deepEqual(rankJapaneseMatches(matches, "ちょっと").map(({id}) => id), ["2", "1", "3"]);
});

test("duplicates are dropped and remaining ties go to the lower JMdict id", () => {
  const a = word("10", [], ["あ*"], [["int"]]);
  const b = word("11", [], ["あ*"], [["int"]]);
  assert.deepEqual(rankJapaneseMatches([b, a, b, a], "あ").map(({id}) => id), ["10", "11"]);
  const tiedKanji = [word("3", ["上*"], ["かみ*"], [["n"]]), word("3", ["上*"], ["かみ*"], [["n"]])];
  assert.equal(rankJapaneseMatches(tiedKanji, "上").length, 1);
  assert.deepEqual(rankJapaneseMatches([], "上"), []);
  // An entry with no senses or readings does not throw.
  assert.equal(rankJapaneseMatches([{id: "9", kanji: [], kana: [], sense: []}], "x").length, 1);
});

test("searchJapanese reads every exact reading, then `limit` longer ones and every spelling", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "miteiru-search-test-"));
  const file = path.join(directory, "jmdict.json");
  await fs.writeFile(file, JSON.stringify({
    version: "1", dictDate: "2026-01-01", dictRevisions: [], tags: {},
    words: [
      // いい: five archaic words index before the common one.
      word("2571360", ["怡々"], ["いい"], [["adj-t", "adv-to"]]),
      word("2672300", ["謂"], ["いい"], [["n"]]),
      word("2672310", ["飯"], ["いい"], [["n"]]),
      word("2672320", ["易々"], ["いい"], [["adj-t", "adv-to"]]),
      word("2672330", ["唯々"], ["いい"], [["adj-t", "adv-to"]]),
      word("2820690", [], ["いい*"], [["adj-ix"], ["adj-ix"], ["adj-ix"], ["adj-ix"]]),
      word("1188430", [], ["いいえ*"], [["int"]]),
      word("1188380", ["好い加減*"], ["いいかげん*"], [["adj-na"]]),
      word("1580640", ["人*"], ["ひと*"], [["n"]]),
      word("1366410", ["人*"], ["じん*"], [["suf"]]),
      word("1583000", ["人形*"], ["にんぎょう*"], [["n"]])
    ]
  }), "utf8");
  const {db} = await setupJmdict(path.join(directory, "jmdict-db"), file);
  try {
    const ids = async (query: string, limit?: number) => (await searchJapanese(db, query, limit)).map(({id}) => id);
    // The first five reading matches, all the old lookup read, miss the common いい.
    assert.ok(!(await readingBeginning(db, "いい", 5)).some(({id}) => id === "2820690"));
    const withOneLonger = await ids("いい", 1);
    assert.equal(withOneLonger[0], "2820690");
    assert.equal(withOneLonger.length, 7);
    assert.ok(withOneLonger.includes("1188430"), "one longer reading besides the exact ones");
    assert.equal((await ids("いい", 0)).length, 6);
    assert.equal((await ids("いい")).length, 8);
    assert.deepEqual(await ids("人", 5), ["1580640", "1366410", "1583000"]);
    assert.deepEqual(await ids("ない", 5), []);
  } finally {
    await db.close();
    await fs.rm(directory, {recursive: true, force: true});
  }
});
