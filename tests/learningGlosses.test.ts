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
      // Neither 尤も spelling is common; the word spelled 尤も first wins over 最も's variant.
      word("1293700", ["最も", "尤も"], ["もっとも"], "most", "adv", false),
      word("1535810", ["尤も"], ["もっとも"], "but then", "conj", false),
      // A kana word with homophones gets the common one.
      word("1182010", ["黄梢"], ["こうしょう"], "spring of yellow buds", "n", false),
      word("1272110", ["交渉"], ["こうしょう"], "negotiations"),
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
    assert.equal(await japaneseLearningGloss(db, {target: "尤も", reading: "もっとも"}), "but then");
    assert.equal(await japaneseLearningGloss(db, {target: "こうしょう", reading: "こうしょう"}), "negotiations");
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

// ---- Bug fixes: POS-blind Japanese glosses, and Chinese meanings over 10 characters dropped ----------

const sense = (pos: string[], glosses: string[], info: string[] = []) => ({
  partOfSpeech: pos, appliesToKanji: ["*"], appliesToKana: ["*"], related: [], antonym: [], field: [], dialect: [],
  misc: [], info, languageSource: [], gloss: glosses.map((text) => ({lang: "eng", text, type: null}))
});

test("japaneseLearningGloss picks the entry and sense that fit the token's part of speech", async () => {
  const file = path.join(directory, "jmdict-pos.json");
  await fs.writeFile(file, JSON.stringify({
    version: "1", dictDate: "2026-01-01", dictRevisions: [], tags,
    words: [
      // JMdict's さん entries: the common noun 酸 sorts before the suffix, which used to win.
      {id: "1304260", kanji: [{common: true, text: "酸", tags: []}], kana: [{common: true, text: "さん", tags: [], appliesToKanji: ["*"]}], sense: [sense(["n"], ["acid"])]},
      {id: "1005340", kanji: [], kana: [{common: true, text: "さん", tags: [], appliesToKanji: ["*"]}], sense: [sense(["suf"], ["Mr.", "Mrs.", "Miss"])]},
      {id: "1008490", kanji: [], kana: [{common: true, text: "と", tags: [], appliesToKanji: ["*"]}], sense: [
        sense(["prt", "conj"], ["if", "when"]), sense(["prt", "conj"], ["and"]), sense(["prt"], ["with"]),
        sense(["prt"], ["used for quoting (thoughts, speech, etc.)"])
      ]}
    ]
  }), "utf8");
  const {db} = await setupJmdict(path.join(directory, "jmdict-pos-db"), file);
  try {
    // Without a part of speech the old order stands (what a 7.x renderer still asks).
    assert.equal(await japaneseLearningGloss(db, {target: "さん", reading: "さん"}), "acid");
    assert.equal(await japaneseLearningGloss(db, {target: "さん", reading: "さん", pos: "名詞-接尾-人名"}), "Mr.");
    assert.equal(await japaneseLearningGloss(db, {target: "と", reading: "と", pos: "助詞-格助詞-一般"}), "with");
    assert.equal(await japaneseLearningGloss(db, {target: "と", reading: "と", pos: "助詞-並立助詞"}), "and");
    assert.equal(await japaneseLearningGloss(db, {target: "と", reading: "と", pos: "助詞-接続助詞"}), "if");
    assert.equal(await japaneseLearningGloss(db, {target: "と", reading: "と", pos: "助詞-格助詞-引用"}), "used for quoting");
  } finally {
    await db.close();
  }
});

test("pickChineseGloss keeps meanings longer than 10 characters and reads CantoDict's nested senses", () => {
  // CC-CEDICT entries as the Mandarin pack stores them.
  assert.equal(pickChineseGloss([{id: "61934", content: "沒想到", simplified: "没想到", pinyin: ["mei2 xiang3 dao4"], meaning: ["didn't expect"]}], "没想到"), "didn't expect");
  assert.equal(pickChineseGloss([{id: "71381", content: "玉皇大帝", simplified: "玉皇大帝", pinyin: ["Yu4 huang2 Da4 di4"], meaning: ["Jade Emperor"]}], "玉皇大帝"), "Jade Emperor");
  assert.equal(pickChineseGloss([{id: "122276", content: "龍王", simplified: "龙王", pinyin: ["Long2 wang2"], meaning: ["Dragon King (mythology)"]}], "龙王"), "Dragon King");
  // 后 is a surname, empress, and the simplified form of 後: the common word wins.
  const hou = [
    {id: "19995", content: "后", simplified: "后", pinyin: ["Hou4"], meaning: ["surname Hou"]},
    {id: "19996", content: "后", simplified: "后", pinyin: ["hou4"], meaning: ["empress", "queen", "(archaic) monarch", "ruler"]},
    {id: "39216", content: "後", simplified: "后", pinyin: ["hou4"], meaning: ["back", "behind", "rear", "afterwards", "after", "later", "post-"]}
  ];
  assert.equal(pickChineseGloss(hou, "后"), "back");
  assert.equal(pickChineseGloss(hou, "後"), "back");
  // CantoDict's word list: each inner list is a sense cut at its commas.
  const yumCha = {id: "15178", content: "飲茶", simplified: "", pinyin: null, jyutping: "jam2 caa4",
    meaning: [["to drink tea"], ["to go yumcha", " to have dim sum at a teahouse, usually referring to a meal at the time of breakfast or lunch only"]]};
  assert.equal(pickChineseGloss([yumCha], "飲茶", {cantonese: true}), "to drink tea");
  const zo = {id: "2372", content: "咗", simplified: "", pinyin: null, jyutping: "zo2",
    meaning: [["used after a verb as a perfective aspect marker for completed actions or past events"]]};
  const hint = pickChineseGloss([zo], "咗", {cantonese: true});
  assert.ok(hint.startsWith("used after a verb") && hint.endsWith("…") && hint.length <= 25, hint);
});
