import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {after, before, test} from "node:test";
import {setupJmdict, type JmdictWord} from "../main/dictionary/jmdictDb";
import {
  glossAll,
  japaneseLearningGloss,
  pickChineseGloss,
  pickJapaneseGloss,
  pickVietnameseGloss,
  rankJapaneseMatches
} from "../main/handler/languages/learningGlosses";

let directory: string;

before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "miteiru-gloss-test-"));
});

after(async () => {
  await fs.rm(directory, {recursive: true, force: true});
});

const word = (id: string, kanji: string[], kana: string[], gloss: string, pos = "n", common = true): JmdictWord => ({
  id,
  kanji: kanji.map((text) => ({common, text, tags: []})),
  kana: kana.map((text) => ({common, text, tags: [], appliesToKanji: ["*"]})),
  sense: [{
    partOfSpeech: [pos], appliesToKanji: [], appliesToKana: [], related: [], antonym: [], field: [], dialect: [],
    misc: [], info: [], languageSource: [], gloss: [{lang: "eng", text: gloss, type: null}]
  }],
});

const tags = {n: "noun (common) (futsuumeishi)", v5r: "Godan verb with 'ru' ending", suf: "suffix", exp: "expressions"};

test("pickJapaneseGloss matches JMdict kana against furigana readings and strips notes", () => {
  assert.equal(pickJapaneseGloss([word("1", ["大いさ"], ["おおきい"], "big (in size)")], "大きい", "おおきい"), "big");
  // Token readings keep ー while JMdict may spell the vowel out.
  assert.equal(pickJapaneseGloss([word("2", [], ["コーヒー"], "coffee")], "コーヒー", "こーひー"), "coffee");
  assert.equal(pickJapaneseGloss([word("3", ["別"], ["べつ"], "other")], "違う", "ちがう"), "");
});

// The comparator queryJapanese used before it moved to rankJapaneseMatches, kept to prove the order is unchanged.
const legacyRank = (input: JmdictWord[], query: string) => {
  const ids = input.map((o) => o.id);
  const matches = input.filter(({id}, index) => !ids.includes(id, index + 1)).sort((a: any, b: any) => {
    const commonA = (a.kanji.length ? a.kanji[0].common : 0);
    const commonB = (b.kanji.length ? b.kanji[0].common : 0);
    if (commonA !== commonB) return commonB - commonA;
    const smallestA = (a.kanji.length ? (a.kanji[0].text ?? "".length) : 0);
    const smallestB = (b.kanji.length ? (b.kanji[0].text ?? "".length) : 0);
    if (smallestA !== smallestB) return smallestA - smallestB;
    const isVerbA = +(!tags[a.sense[0].partOfSpeech[0]].includes("verb"));
    const isVerbB = +(!tags[b.sense[0].partOfSpeech[0]].includes("verb"));
    if (isVerbA !== isVerbB) return isVerbA - isVerbB;
    const isNounA = +(!tags[a.sense[0].partOfSpeech[0]].includes("noun"));
    const isNounB = +(!tags[b.sense[0].partOfSpeech[0]].includes("noun"));
    if (isNounA !== isNounB) return isNounA - isNounB;
    if (a.kanji.length !== b.kanji.length) return a.kanji.length - b.kanji.length;
  });
  for (let i = 0; i < matches.length; i++) {
    if (matches[i].kanji.map((val) => val.text ?? "").includes(query)) {
      [matches[i], matches[0]] = [matches[0], matches[i]];
      break;
    }
  }
  return matches.map((match) => match.id);
};

test("rankJapaneseMatches orders results exactly like the old queryJapanese comparator", () => {
  const pool = [
    word("1", ["人"], ["ひと"], "person"),
    word("2", ["人"], ["にん"], "counter for people", "suf"),
    word("3", ["人"], ["じん"], "-ian", "suf", false),
    word("4", ["人形"], ["にんぎょう"], "doll"),
    word("5", [], ["ひと"], "hito", "exp", false),
    word("6", [], ["なる"], "to become", "v5r", false),
    word("7", ["人", "他人"], ["ひと"], "other people", "n"),
    word("8", ["成る"], ["なる"], "to become", "v5r"),
    word("9", [], ["なるほど"], "I see", "exp", false),
  ];
  let seed = 7;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let round = 0; round < 300; round++) {
    const input = pool.filter(() => random() < 0.7).sort(() => random() - 0.5);
    if (random() < 0.3 && input.length) input.push(input[0]);
    for (const query of ["人", "なる", "ひと"]) {
      assert.deepEqual(rankJapaneseMatches(input, query, tags).map((match) => match.id), legacyRank(input, query),
        `${query} ${input.map((match) => match.id).join(",")}`);
    }
  }
});

test("japaneseLearningGloss reads exact spellings, not every word that starts with them", async () => {
  const file = path.join(directory, "jmdict.json");
  await fs.writeFile(file, JSON.stringify({
    version: "1", dictDate: "2026-01-01", dictRevisions: [], tags,
    words: [
      word("100", ["人形"], ["にんぎょう"], "doll"),
      word("101", ["人"], ["ひと"], "person (human)"),
      word("102", ["人"], ["にん"], "counter for people", "suf"),
      word("103", ["成る"], ["なる"], "to become", "v5r"),
      word("104", [], ["なるほど"], "I see", "exp"),
    ]
  }), "utf8");
  const {db} = await setupJmdict(path.join(directory, "jmdict-db"), file);
  try {
    assert.equal(await japaneseLearningGloss(db, tags, {target: "人", reading: "ひと"}), "person");
    assert.equal(await japaneseLearningGloss(db, tags, {target: "人形", reading: "にんぎょう"}), "doll");
    assert.equal(await japaneseLearningGloss(db, tags, {target: "なるほど", reading: "なるほど"}), "I see");
    assert.equal(await japaneseLearningGloss(db, tags, {target: "成る", reading: "なる"}), "to become");
    assert.equal(await japaneseLearningGloss(db, tags, {target: "", reading: ""}), "");
    assert.equal(await japaneseLearningGloss(db, tags, {target: "*", reading: ""}), "");
  } finally {
    await db.close();
  }
});

test("Chinese and Vietnamese glosses keep their short-meaning rules", () => {
  const entry = {content: "學生，学生", simplified: "学生", meaning: ["student (school); pupil", "schoolchild [formal]"]};
  assert.equal(pickChineseGloss([entry], "學生"), "student");
  assert.equal(pickChineseGloss([entry], "学生"), "student");
  assert.equal(pickChineseGloss([entry], "大學"), "");
  assert.equal(pickVietnameseGloss("to eat (food); to consume, dine"), "dine");
  assert.equal(pickVietnameseGloss("a very long meaning that will not fit, another overly long meaning"), "");
});

test("glossAll keeps request order and turns a failed lookup into an empty gloss", async () => {
  const glosses = await glossAll([{target: "a"}, {target: "boom"}, {target: "c"}], async ({target}) => {
    if (target === "boom") throw new Error("lookup failed");
    return target.toUpperCase();
  });
  assert.deepEqual(glosses, ["A", "", "C"]);
  assert.deepEqual(await glossAll(undefined as never, async () => "x"), []);
});
