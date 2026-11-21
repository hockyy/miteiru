import assert from "node:assert/strict";
import {test} from "node:test";
import {sentencePinyin} from "../main/handler/chinese";
import {convertPinyinBatch, fullPinyinBatch, numberedPinyinBatch} from "../main/language/pinyin";
import {toPinyinToneMarks} from "../main/handler/pinyinTones";
import fixture from "./fixtures/in-house/pinyin-pro.json";

test("pinyin-pro 3.29.3 whole-line results and traditional origins match the reference", async () => {
  const texts = fixture.cases.map(row => row.text);
  const results = await fullPinyinBatch(texts);
  const numbers = await numberedPinyinBatch(texts);
  for (const [i, {text, items, simplifiedReadings}] of fixture.cases.entries()) {
    const raw = items.map(id => fixture.items[id]);
    assert.deepEqual(results[i], raw, text);
    assert.deepEqual(numbers[i], raw.map(item => item.pinyin), text);
    const sentence = simplifiedReadings
      ? Array.from(text, (origin, i) => ({origin, pinyin: simplifiedReadings[i]}))
      : raw;
    assert.deepEqual(await sentencePinyin(text), sentence, text);
  }
});

test("pinyin-pro 3.29.3 converts numeric and marked tones for syllables and whole lines", async () => {
  const inputs = fixture.conversions.map(row => row.input);
  const marks = await convertPinyinBatch(inputs, "numToSymbol");
  const numbers = await convertPinyinBatch(inputs, "symbolToNum");
  for (const [i, {input, marked, numbered}] of fixture.conversions.entries()) {
    assert.equal(marks[i], marked, input);
    assert.equal(toPinyinToneMarks(input), marked.replace(/[05]$/, ""), input);
    assert.equal(numbers[i], numbered, input);
  }
});
