import assert from "node:assert/strict";
import {test} from "node:test";
import {
  formatPinyinReading,
  replacePinyinToneSymbol,
  toPinyinToneMarks
} from "../main/handler/pinyinTones";

test("replacePinyinToneSymbol maps Mandarin contours", () => {
  assert.equal(replacePinyinToneSymbol("ni1"), "niˉ¹");
  assert.equal(replacePinyinToneSymbol("hao2"), "hao⸍²");
  assert.equal(replacePinyinToneSymbol("hao3"), "haoᵛ₃");
  assert.equal(replacePinyinToneSymbol("na4"), "na⸌₄");
  assert.equal(replacePinyinToneSymbol("de5"), "de·₅");
  assert.equal(replacePinyinToneSymbol("ma0"), "ma·₅");
});

test("replacePinyinToneSymbol leaves unnumbered syllables alone", () => {
  assert.equal(replacePinyinToneSymbol(""), "");
  assert.equal(replacePinyinToneSymbol("Peppa"), "Peppa");
  assert.equal(replacePinyinToneSymbol("nǐ"), "nǐ");
});

test("toPinyinToneMarks places tones on vowels", () => {
  assert.equal(toPinyinToneMarks("ni3"), "nǐ");
  assert.equal(toPinyinToneMarks("hao3"), "hǎo");
  assert.equal(toPinyinToneMarks("ma1"), "mā");
  assert.equal(toPinyinToneMarks("xue2"), "xué");
  assert.equal(toPinyinToneMarks("de5"), "de");
});

test("formatPinyinReading uses contours for num and diacritics for symbol", () => {
  assert.equal(formatPinyinReading("ni3", "num"), "niᵛ₃");
  assert.equal(formatPinyinReading("ni3", "symbol"), "nǐ");
  assert.equal(formatPinyinReading("hao2", "num"), "hao⸍²");
  assert.equal(formatPinyinReading("hao2", "symbol"), "háo");
});
