import assert from "node:assert/strict";
import {test} from "node:test";
import {
  formatJyutpingReading,
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

// The setting is "Tone numbers: ni3 hao3", off for "Tone marks: nǐ hǎo" (VideoPlayer/Sidebar.tsx). Before
// the fix `num` gave contour marks (niᵛ₃), and Cantonese had the two swapped (`num` gave neiˍ₅).
test("formatPinyinReading gives tone numbers for num and tone marks for symbol", () => {
  assert.equal(formatPinyinReading("ni3", "num"), "ni3");
  assert.equal(formatPinyinReading("ni3", "symbol"), "nǐ");
  assert.equal(formatPinyinReading("hao2", "num"), "hao2");
  assert.equal(formatPinyinReading("hao2", "symbol"), "háo");
  // pinyin-pro writes the neutral tone as 0; a tone number shows it as 5, a tone mark as nothing.
  assert.equal(formatPinyinReading("ma0", "num"), "ma5");
  assert.equal(formatPinyinReading("ma0", "symbol"), "ma");
  assert.equal(formatPinyinReading("", "num"), "");
});

test("formatJyutpingReading gives tone numbers for num and contour marks for symbol", () => {
  assert.equal(formatJyutpingReading("nei5", "num"), "nei5");
  assert.equal(formatJyutpingReading("nei5", "symbol"), "nei⸝₅");
  assert.equal(formatJyutpingReading("sik6", "symbol"), "sikˍ₆");
  assert.equal(formatJyutpingReading("hou2", "symbol"), "hou⸍²");
  assert.equal(formatJyutpingReading(null, "symbol"), null);
  assert.equal(formatJyutpingReading("abc", "symbol"), "abc");
});
