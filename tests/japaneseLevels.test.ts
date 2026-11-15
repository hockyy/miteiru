import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {test} from "node:test";
import {japaneseLevelFields, lookupFrequency, lookupJlpt, parseJapaneseLevels} from "../main/language/japaneseLevels";
import {compactFrequency, compactJlptRows, csvFields, decodeMsgpack, ZIPF_MIN} from "../scripts/data/buildJapaneseLevels";

const sample = parseJapaneseLevels({
  meta: {format: 2},
  jlpt: [
    [1579110, 5, "今日", "きょう"],
    [1579110, 3, "今日", "こんにち"],
    [1401310, 1, "相変わらず", "あいかわらず"],
    [1401310, 2, "", "あいかわらず"],
    [1000320, 5, "", "あそこ"],
    [1582390, 1, "銅", "あかがね"],
    [1582390, 2, "銅", "どう"],
    [0, 1, "依", "い"]
  ],
  frequency: [[128, ["の"]], [148, ["に", "て"]], [203, ["ｱｲｳ"]], [557, ["今日"]]]
})!;

test("JLPT levels: the entry and reading decide, and one entry can be at two levels", () => {
  assert.equal(lookupJlpt(sample, {entryId: "1579110", spelling: "今日", reading: "きょう"}), "N5");
  assert.equal(lookupJlpt(sample, {entryId: 1579110, spelling: "今日", reading: "コンニチ"}), "N3");
  // No reading, or one the lists don't have: rows that disagree give no level rather than a guess.
  assert.equal(lookupJlpt(sample, {entryId: "1579110", spelling: "今日"}), undefined);
  assert.equal(lookupJlpt(sample, {spelling: "今日", reading: "けふ"}), undefined);
  // Listed twice with one reading: the easiest level.
  assert.equal(lookupJlpt(sample, {entryId: "1401310", spelling: "相変わらず", reading: "あいかわらず"}), "N2");
  // A kana word is found by its reading, in katakana too.
  assert.equal(lookupJlpt(sample, {spelling: "あそこ"}), "N5");
  assert.equal(lookupJlpt(sample, {spelling: "アソコ"}), "N5");
  // Without an entry id, the spelling and reading still work; a kanji listed without an entry too.
  assert.equal(lookupJlpt(sample, {spelling: "銅", reading: "どう"}), "N2");
  assert.equal(lookupJlpt(sample, {spelling: "依"}), "N1");
  assert.equal(lookupJlpt(sample, {spelling: "猫"}), undefined);
  assert.equal(lookupJlpt(null, {spelling: "今日"}), undefined);
});

test("Word frequency: ranks are shared within a bucket and words are matched in wordfreq's normal form", () => {
  assert.deepEqual(lookupFrequency(sample, "の"), {rank: 1, zipf: 7.72});
  assert.deepEqual(lookupFrequency(sample, "に"), {rank: 2, zipf: 7.52});
  assert.deepEqual(lookupFrequency(sample, "て"), {rank: 2, zipf: 7.52});
  assert.deepEqual(lookupFrequency(sample, "今日"), {rank: 5, zipf: 3.43});
  // The list is in NFKC: half-width katakana in the list is ｱｲｳ, which NFKC writes as アイウ.
  assert.equal(lookupFrequency(sample, "猫"), undefined);
  assert.deepEqual(japaneseLevelFields(sample, {entryId: "1579110", spelling: "今日", reading: "きょう"}), {jlpt: "N5", freq_rank: 5, freq_zipf: 3.43});
  assert.deepEqual(japaneseLevelFields(sample, {spelling: "猫"}), {});
});

test("parseJapaneseLevels rejects other shapes and skips damaged rows", () => {
  assert.equal(parseJapaneseLevels(null), null);
  assert.equal(parseJapaneseLevels({jlpt: {}, rank: {}}), null);
  const levels = parseJapaneseLevels({jlpt: [[1, 9, "x", "えっくす"], [2, 4, "", ""], "junk", [3, 4, "語", "ご"]], frequency: [[100, "no"], [120, ["語"]]]})!;
  assert.equal(levels.byEntry.size, 1);
  assert.equal(lookupJlpt(levels, {entryId: 3, spelling: "語", reading: "ご"}), "N4");
  assert.deepEqual(lookupFrequency(levels, "語"), {rank: 1, zipf: 7.8});
});

test("The shipped words.json parses and answers for common words", () => {
  const file = path.join(__dirname, "..", "renderer", "public", "study-data", "japanese-levels", "words.json");
  const levels = parseJapaneseLevels(JSON.parse(fs.readFileSync(file, "utf8")))!;
  assert.ok(levels, "words.json is format 2");
  assert.ok(levels.byEntry.size > 7000, `${levels.byEntry.size} JMdict entries have a JLPT level`);
  assert.ok(levels.frequency.size > 25000);
  assert.equal(lookupJlpt(levels, {entryId: "1579110", spelling: "今日", reading: "きょう"}), "N5");
  assert.equal(lookupJlpt(levels, {entryId: "1579110", spelling: "今日", reading: "こんにち"}), "N3");
  assert.equal(lookupJlpt(levels, {spelling: "猫", reading: "ねこ"}), "N5");
  assert.equal(lookupFrequency(levels, "の")?.rank, 1);
  assert.ok((lookupFrequency(levels, "税理士")?.zipf ?? 0) >= ZIPF_MIN);
});

test("The build reads wordfreq's msgpack and Waller's CSVs", () => {
  // [{"format":"cB","version":1}, [], ["の"], ["1", "に", "て"]] in msgpack.
  const packed = Uint8Array.from([
    0x94,
    0x82, 0xa6, ...Buffer.from("format"), 0xa2, ...Buffer.from("cB"), 0xa7, ...Buffer.from("version"), 0x01,
    0x90,
    0x91, 0xa3, ...Buffer.from("の"),
    0x93, 0xa1, ...Buffer.from("1"), 0xa3, ...Buffer.from("に"), 0xa3, ...Buffer.from("て")
  ]);
  const pack = decodeMsgpack(packed);
  assert.deepEqual(pack, [{format: "cB", version: 1}, [], ["の"], ["1", "に", "て"]]);
  // Digits and words without kana or kanji get no rank; empty buckets are dropped.
  // Bucket 2 is Zipf 8.98: kept at a minimum of 8.98, left out at 8.99.
  assert.deepEqual(compactFrequency(pack, 8.99), [[1, ["の"]]]);
  assert.deepEqual(compactFrequency(pack, 8.98), [[1, ["の"]], [2, ["に", "て"]]]);
  assert.deepEqual(compactFrequency(pack, 3), [[1, ["の"]], [2, ["に", "て"]]]);
  assert.throws(() => compactFrequency([{format: "other"}]), /unknown header/);
  assert.throws(() => decodeMsgpack(Uint8Array.from([0x92, 0x01])), /truncated/);
  assert.throws(() => decodeMsgpack(Uint8Array.from([0x01, 0x02])), /after the value/);

  assert.deepEqual(csvFields('1565440,ああ,嗚呼,"Ah!, Oh!, ""Alas!"""'), ["1565440", "ああ", "嗚呼", 'Ah!, Oh!, "Alas!"']);
  const header = "jmdict_seq,kana,kanji,waller_definition";
  const rows = compactJlptRows({
    5: `${header}\n1579110,きょう,今日,today\n1000320,あそこ,,"there, over there"\n`,
    3: `${header}\r\n1579110,こんにち,今日,"today, this day"\r\n`,
    4: `${header}\n1000320,あそこ,,there\n,い,依,depending on\n`
  });
  assert.deepEqual(rows, [
    [1000320, 5, "", "あそこ"],
    [1579110, 5, "今日", "きょう"],
    [0, 4, "依", "い"],
    [1579110, 3, "今日", "こんにち"]
  ]);
  assert.throws(() => compactJlptRows({1: "id,kana\n1,あ"}), /unexpected header/);
});
