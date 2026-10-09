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
  pickVietnameseGloss
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
      // 数 has entries for several readings; the one matching the token's reading wins.
      word("105", ["屡々", "数"], ["しばしば"], "often", "adv"),
      word("106", ["数"], ["かず"], "number"),
    ]
  }), "utf8");
  const {db} = await setupJmdict(path.join(directory, "jmdict-db"), file);
  try {
    assert.equal(await japaneseLearningGloss(db, {target: "人", reading: "ひと"}), "person");
    assert.equal(await japaneseLearningGloss(db, {target: "人形", reading: "にんぎょう"}), "doll");
    assert.equal(await japaneseLearningGloss(db, {target: "なるほど", reading: "なるほど"}), "I see");
    assert.equal(await japaneseLearningGloss(db, {target: "成る", reading: "なる"}), "to become");
    // No word is spelled 成: fall back to spellings starting with it, matched by reading.
    assert.equal(await japaneseLearningGloss(db, {target: "成", reading: "なる"}), "to become");
    assert.equal(await japaneseLearningGloss(db, {target: "数", reading: "かず"}), "number");
    // A kana word missing from JMdict gets no gloss (and no spelling scan).
    assert.equal(await japaneseLearningGloss(db, {target: "ナルトス", reading: "なるとす"}), "");
    assert.equal(await japaneseLearningGloss(db, {target: "", reading: ""}), "");
    assert.equal(await japaneseLearningGloss(db, {target: "*", reading: ""}), "");
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
