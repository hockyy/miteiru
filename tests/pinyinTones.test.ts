import assert from "node:assert/strict";
import {test} from "node:test";
import {formatPinyinReading, replacePinyinToneSymbol} from "../main/handler/pinyinTones";

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

test("formatPinyinReading only rewrites symbol mode", () => {
  assert.equal(formatPinyinReading("ni3", "num"), "ni3");
  assert.equal(formatPinyinReading("ni3", "symbol"), "niᵛ₃");
});
