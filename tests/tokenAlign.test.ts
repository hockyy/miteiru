import assert from "node:assert/strict";
import {test} from "node:test";
import {alignTokens, kindOf, splitUncovered} from "../main/language/tokenAlign";
import {chineseRuby, japaneseRuby} from "../main/language/japaneseRuby";

/** The promise analyze_text makes: the pieces join to the text, with code point offsets end to end. */
const assertCovers = (text: string, pieces: Array<{s: string; start: number; end: number}>) => {
  assert.equal(pieces.map((piece) => piece.s).join(""), text);
  let offset = 0;
  for (const piece of pieces) {
    assert.ok(piece.s.length > 0, "no empty piece");
    assert.equal(piece.start, offset);
    offset += Array.from(piece.s).length;
    assert.equal(piece.end, offset);
  }
  assert.equal(offset, Array.from(text).length);
};

const surface = (token: {origin: string}) => token.origin;

test("alignTokens puts back what the tokenizer dropped: spaces, punctuation and emoji, as pieces of their own", () => {
  const text = "  猫が 好き😀です！\n";
  const pieces = alignTokens(text, [{origin: "猫"}, {origin: "が"}, {origin: "好き"}, {origin: "です"}], surface);
  assertCovers(text, pieces);
  assert.deepEqual(pieces.map((piece) => [piece.s, piece.kind, Boolean(piece.token)]), [
    ["  ", "space", false], ["猫", "word", true], ["が", "word", true], [" ", "space", false], ["好き", "word", true],
    ["😀", "symbol", false], ["です", "word", true], ["！", "punct", false], ["\n", "space", false]
  ]);
});

test("alignTokens drops a token whose text isn't there (a normalized surface) and keeps the text uncovered", () => {
  // The tokenizer turned full-width ＡＢＣ into ABC: the original stays, as an uncovered word.
  const text = "ＡＢＣの猫";
  const pieces = alignTokens(text, [{origin: "ABC"}, {origin: "の"}, {origin: "猫"}], surface);
  assertCovers(text, pieces);
  assert.deepEqual(pieces.map((piece) => [piece.s, Boolean(piece.token)]), [["ＡＢＣ", false], ["の", true], ["猫", true]]);
  // A surface found only far ahead belongs to a later occurrence, not this token.
  const far = `${"あ".repeat(80)}猫`;
  const skipped = alignTokens(far, [{origin: "猫"}], surface);
  assertCovers(far, skipped);
  assert.equal(skipped.some((piece) => piece.token), false);
});

test("alignTokens keeps grapheme clusters whole and counts astral characters as one code point", () => {
  const text = "👨‍👩‍👧𠮷野家é";
  const pieces = alignTokens(text, [{origin: "𠮷野家"}], surface);
  assertCovers(text, pieces);
  assert.deepEqual(pieces.map((piece) => piece.s), ["👨‍👩‍👧", "𠮷野家", "é"]);
  assert.equal(pieces[1].start, 5);
  assert.equal(pieces[1].end, 8);
});

test("kindOf and splitUncovered sort text no token covered", () => {
  assert.equal(kindOf(" \t"), "space");
  assert.equal(kindOf("。"), "punct");
  assert.equal(kindOf("★"), "symbol");
  assert.equal(kindOf("abc"), "word");
  assert.deepEqual(splitUncovered("ab, cd!!"), [
    {s: "ab", kind: "word"}, {s: ",", kind: "punct"}, {s: " ", kind: "space"}, {s: "cd", kind: "word"}, {s: "!", kind: "punct"}, {s: "!", kind: "punct"}
  ]);
});

/** A small deterministic random source, so a failure can be replayed. */
const random = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

test("alignTokens covers the text exactly, whatever the tokenizer did with it (random lines)", () => {
  const pool = ["猫", "が", "好き", "です", "今日", "ね", "、", "。", " ", "  ", "\t", "\n", "a", "Hello", "123", "！", "😀", "👍🏽", "𠮷", "é", "é", "ー", "（", "）", "龍王", "佢哋", "xin", "chào", ",", "."];
  const next = random(7);
  for (let round = 0; round < 500; round++) {
    const parts = Array.from({length: 1 + Math.floor(next() * 12)}, () => pool[Math.floor(next() * pool.length)]);
    const text = parts.join("");
    // A tokenizer that drops spaces, sometimes drops a token, sometimes normalizes one, sometimes merges two.
    const tokens: Array<{origin: string}> = [];
    for (let index = 0; index < parts.length; index++) {
      const part = parts[index];
      const roll = next();
      if (/^\s+$/.test(part) || roll < 0.1) continue;
      if (roll < 0.15) tokens.push({origin: part.toUpperCase() === part ? `${part}x` : part.toUpperCase()});
      else if (roll < 0.25 && index + 1 < parts.length) tokens.push({origin: part + parts[++index]});
      else tokens.push({origin: part});
    }
    assertCovers(text, alignTokens(text, tokens, surface));
  }
});

test("japaneseRuby gives each kanji run its reading and leaves okurigana and kana bare", () => {
  assert.deepEqual(japaneseRuby("送り仮名", "おくりがな"), [{base: "送", ruby: "おく"}, {base: "り", ruby: ""}, {base: "仮名", ruby: "がな"}]);
  assert.deepEqual(japaneseRuby("聞き手", "ききて"), [{base: "聞", ruby: "き"}, {base: "き", ruby: ""}, {base: "手", ruby: "て"}]);
  assert.deepEqual(japaneseRuby("お話しした", "おはなしした"), [{base: "お", ruby: ""}, {base: "話", ruby: "はな"}, {base: "しした", ruby: ""}]);
  assert.deepEqual(japaneseRuby("今日", "きょう"), [{base: "今日", ruby: "きょう"}]);
  // A katakana reading is given in hiragana.
  assert.deepEqual(japaneseRuby("大人しい", "オトナシイ"), [{base: "大人", ruby: "おとな"}, {base: "しい", ruby: ""}]);
  // Kana only, and a digit that needs a reading with its kanji.
  assert.deepEqual(japaneseRuby("コーヒー", "こーひー"), [{base: "コーヒー", ruby: ""}]);
  assert.deepEqual(japaneseRuby("3月", "さんがつ"), [{base: "3月", ruby: "さんがつ"}]);
  // A reading that doesn't fit the kana: the whole word, the whole reading.
  assert.deepEqual(japaneseRuby("食べる", "のむ"), [{base: "食べる", ruby: "のむ"}]);
  // No reading: the runs, unread.
  assert.deepEqual(japaneseRuby("猫が", ""), [{base: "猫", ruby: ""}, {base: "が", ruby: ""}]);
  assert.deepEqual(japaneseRuby("", "ねこ"), []);
});

test("japaneseRuby gives up on a pathological word quickly, as one segment", () => {
  const surface = "日の".repeat(30);
  const started = performance.now();
  const ruby = japaneseRuby(surface, "の".repeat(59) + "x");
  assert.ok(performance.now() - started < 1000);
  assert.equal(ruby.map((segment) => segment.base).join(""), surface);
});

test("chineseRuby reads each Han character and leaves the rest bare", () => {
  assert.deepEqual(chineseRuby([{main: "没", reading: "méi"}, {main: "，", reading: "x"}, {main: "A", reading: ""}]), [
    {base: "没", ruby: "méi"}, {base: "，", ruby: ""}, {base: "A", ruby: ""}
  ]);
});
