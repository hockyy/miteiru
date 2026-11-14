import assert from "node:assert/strict";
import {test} from "node:test";
import {computeCoverage, isCountedWord, readingDiffers, wordKey} from "../main/mcp/videoCoverage";

const ja = (origin: string, pos = "名詞", extra: Record<string, unknown> = {}) => ({
  origin,
  basicForm: origin,
  hiragana: origin,
  pos,
  ...extra
});
const zh = (origin: string, pinyin = "") => ({origin, pinyin});

// `count` lines of one word each, to make percentages easy to read.
const words = (...groups: Array<[token: any, count: number]>) => groups.flatMap(([token, count]) => Array.from({length: count}, () => [token]));

test("wordKey is the dictionary form when it is a real one, else the text", () => {
  assert.equal(wordKey({origin: "見た", basicForm: "見る"}), "見る");
  assert.equal(wordKey({origin: "ググる", basicForm: "*"}), "ググる");
  assert.equal(wordKey({origin: "猫", basicForm: ""}), "猫");
  assert.equal(wordKey({origin: "你好"}), "你好");
});

test("function words and punctuation are not counted words", () => {
  for (const pos of ["助詞", "助詞-格助詞", "助動詞", "接頭詞-名詞接続", "記号-句点", "フィラー", "感動詞", "その他"]) {
    assert.equal(isCountedWord(ja("の", pos)), false, pos);
  }
  assert.equal(isCountedWord(ja("猫", "名詞-一般")), true);
  assert.equal(isCountedWord(ja("食べた", "動詞", {basicForm: "食べる"})), true);
  assert.equal(isCountedWord(ja("。", "名詞")), false);
  assert.equal(isCountedWord(zh("，")), false);
  assert.equal(isCountedWord(zh("123")), false);
  // Without a part of speech nothing is filtered by it: Chinese and Vietnamese count every word.
  assert.equal(isCountedWord(zh("的")), true);
});

test("grammatical nouns and name suffixes are not counted, but counters and other suffixes are", () => {
  assert.equal(isCountedWord(ja("の", "名詞-非自立-一般")), false);
  assert.equal(isCountedWord(ja("よう", "名詞-非自立-助動詞語幹")), false);
  assert.equal(isCountedWord(ja("さん", "名詞-接尾-人名")), false);
  assert.equal(isCountedWord(ja("本", "名詞-接尾-助数詞")), true);
  assert.equal(isCountedWord(ja("的", "名詞-接尾-形容動詞語幹")), true);
});

test("a katakana word's reading is left out, even with a long vowel mark", () => {
  assert.equal(readingDiffers("ラーメン", "らーめん"), false);
  assert.equal(readingDiffers("テレビ", "てれび"), false);
  assert.equal(readingDiffers("ごはん", "ごはん"), false);
  assert.equal(readingDiffers("猫", "ねこ"), true);
  assert.equal(readingDiffers("我", "wǒ"), true);
});

test("coverage is the share of spoken words saved as Known or Learning, to one decimal", () => {
  const lines = words([ja("猫"), 3], [ja("犬"), 3], [ja("鳥"), 1]);
  const coverage = computeCoverage(lines, {猫: {level: 2}, 犬: {level: 1}}, 1);
  assert.deepEqual(coverage.words, {spoken: 7, different: 3, differentNotSaved: 1});
  assert.deepEqual(coverage.coverage, {known: 42.9, learning: 42.9, notSaved: 14.2});
  assert.equal(coverage.verdict, "challenging");
});

test("a word is counted by its dictionary form, so an inflected one counts for its base", () => {
  const lines = [[ja("見た", "動詞", {basicForm: "見る"})], [ja("見る", "動詞")], [ja("見て", "動詞", {basicForm: "見る"})]];
  const coverage = computeCoverage(lines, {見る: {level: 2}}, 1);
  assert.deepEqual(coverage.words, {spoken: 3, different: 1, differentNotSaved: 0});
  assert.equal(coverage.coverage.known, 100);
});

test("nothing spoken is all zeros", () => {
  const coverage = computeCoverage([[ja("の", "助詞")], [ja("。", "記号")]], {}, 3);
  assert.deepEqual(coverage.words, {spoken: 0, different: 0, differentNotSaved: 0});
  assert.deepEqual(coverage.coverage, {known: 0, learning: 0, notSaved: 0});
  assert.deepEqual(coverage.topNotSaved, []);
  assert.deepEqual(computeCoverage([], {}, 3).words, {spoken: 0, different: 0, differentNotSaved: 0});
});

test("the verdict flips at 95 and 85 percent saved", () => {
  const saved = {猫: {level: 2}};
  const at = (savedCount: number) => computeCoverage(words([ja("猫"), savedCount], [ja("犬"), 20 - savedCount]), saved, 1);
  assert.equal(at(20).verdict, "comfortable");
  assert.equal(at(19).coverage.known, 95);
  assert.equal(at(19).verdict, "comfortable");
  assert.equal(at(18).verdict, "challenging");
  assert.equal(at(17).coverage.known, 85);
  assert.equal(at(17).verdict, "challenging");
  assert.equal(at(16).verdict, "hard");
  // Known and Learning add up: 10 + 9 of 20 is 95.
  const mixed = computeCoverage(words([ja("猫"), 10], [ja("犬"), 9], [ja("鳥"), 1]), {猫: {level: 2}, 犬: {level: 1}}, 1);
  assert.equal(mixed.verdict, "comfortable");
});

test("a saved level other than 1 or 2 counts as not saved", () => {
  const coverage = computeCoverage(words([ja("猫"), 2]), {猫: {level: 0}}, 1);
  assert.equal(coverage.coverage.notSaved, 100);
  assert.deepEqual(coverage.topNotSaved, [{word: "猫", count: 2}]);
});

test("words per minute counts every word with a letter, function words too", () => {
  const lines = [[ja("猫"), ja("が", "助詞"), ja("好き"), ja("。", "記号")], [ja("犬"), ja("が", "助詞")]];
  assert.equal(computeCoverage(lines, {}, 1).wordsPerMinute, 5);
  assert.equal(computeCoverage(lines, {}, 2).wordsPerMinute, 3);
  assert.equal(computeCoverage(lines, {}, 0).wordsPerMinute, 0);
  assert.equal(computeCoverage(lines, {}, -1).wordsPerMinute, 0);
});

test("topNotSaved lists the most frequent unsaved words, ties going to the word heard first", () => {
  const lines = [
    [ja("鳥")], [ja("犬")], [ja("猫")], [ja("犬")], [ja("魚")], [ja("鳥")], [ja("魚")], [ja("saved")]
  ];
  const {topNotSaved, words: counts} = computeCoverage(lines, {saved: {level: 2}}, 1);
  assert.deepEqual(topNotSaved.map(({word, count}) => [word, count]), [["鳥", 2], ["犬", 2], ["魚", 2], ["猫", 1]]);
  assert.equal(counts.differentNotSaved, 4);
});

test("topNotSaved stops at 15 and learningWordsHeard at 10", () => {
  const many = Array.from({length: 20}, (_, index) => ja(`語${String.fromCodePoint(0x4e00 + index)}`));
  const lines = many.map((token) => [token]);
  assert.equal(computeCoverage(lines, {}, 1).topNotSaved.length, 15);
  const learning = Object.fromEntries(many.map((token) => [token.origin, {level: 1}]));
  const heard = computeCoverage(lines, learning, 1).learningWordsHeard;
  assert.equal(heard.length, 10);
  assert.deepEqual(heard[0], {word: many[0].origin, count: 1});
});

test("learningWordsHeard is the Learning words by how often they come up", () => {
  const lines = words([ja("猫"), 1], [ja("犬"), 3], [ja("鳥"), 2], [ja("魚"), 5]);
  const {learningWordsHeard} = computeCoverage(lines, {猫: {level: 1}, 犬: {level: 1}, 鳥: {level: 2}}, 1);
  assert.deepEqual(learningWordsHeard, [{word: "犬", count: 3}, {word: "猫", count: 1}]);
});

test("a Japanese reading comes only from an occurrence of the bare word", () => {
  // 見た is 見る inflected: its kana is not the reading of 見る, so only the bare 見る gives みる.
  const inflected = ja("見た", "動詞", {basicForm: "見る", hiragana: "みた"});
  const bare = ja("見る", "動詞", {hiragana: "みる"});
  assert.equal(computeCoverage([[inflected]], {}, 1).topNotSaved[0].reading, undefined);
  assert.equal(computeCoverage([[inflected], [bare]], {}, 1).topNotSaved[0].reading, "みる");
  assert.equal(computeCoverage([[bare], [inflected]], {}, 1).topNotSaved[0].reading, "みる");
});

test("a reading is left out when it is empty or the word itself, and kept trimmed", () => {
  const plainKana = ja("ねこ", "名詞", {hiragana: "ねこ"});
  const emptyReading = ja("猫", "名詞", {hiragana: "  "});
  const padded = ja("犬", "名詞", {hiragana: " いぬ "});
  const [first, second, third] = computeCoverage([[plainKana], [emptyReading], [padded]], {}, 1).topNotSaved;
  assert.deepEqual([first.word, first.reading], ["ねこ", undefined]);
  assert.deepEqual([second.word, second.reading], ["猫", undefined]);
  assert.deepEqual([third.word, third.reading], ["犬", "いぬ"]);
});

test("Chinese and Cantonese words get their pinyin or jyutping", () => {
  const coverage = computeCoverage([[zh("你好", " ni3 hao3 ")], [{origin: "食飯", jyutping: "sik6 faan6"}], [zh("，", "")]], {}, 1);
  assert.deepEqual(coverage.topNotSaved, [
    {word: "你好", reading: "ni3 hao3", count: 1},
    {word: "食飯", reading: "sik6 faan6", count: 1}
  ]);
});

test("saved words and a key like constructor do not read the object's own prototype", () => {
  const coverage = computeCoverage([[zh("constructor")]], {}, 1);
  assert.equal(coverage.coverage.notSaved, 100);
});
