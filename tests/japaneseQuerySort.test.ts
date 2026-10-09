import assert from "node:assert/strict";
import {test} from "node:test";
import type {JmdictWord} from "../main/dictionary/jmdictDb";
import {rankJapaneseMatches} from "../main/handler/languages/learningGlosses";

// Entries copied from JMdict, trimmed to what the ranking reads. A trailing * marks a common
// spelling or reading; each sense is its parts of speech.
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
  // Both are common spellings of 所, but only 2 is spelled 所 first; JMdict order alone would pick 1.
  assertFirstInAnyOrder([
    word("1", ["其処*", "所*"], ["そこ*"], [["pn"]]),
    word("2", ["所*"], ["ところ*"], [["n"]])
  ], "所", "2");
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
