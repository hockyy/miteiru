import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {test} from "node:test";
import {HAN, loadGold, parseGold, scoreAll, scoreLine, type PredictedToken} from "../scripts/eval/japaneseReadings";
import {defaultAddonPath, loadAddon} from "../main/headless/nativeAddon";

/**
 * The Japanese reading gold set (tests/fixtures/japanese-readings, see its README): the fixture is
 * well formed, the scorer compares analyzers that cut words differently, and Miteiru's own tokenizer
 * (the Rust addon the app and the headless server share) reads its words right in context.
 */
const root = path.resolve(__dirname, "..");
const gold = loadGold();

test("the reading gold set: words join to each line, kanji words have hiragana readings, ids are unique", () => {
  assert.equal(gold.length, 65);
  assert.equal(new Set(gold.map((line) => line.id)).size, gold.length);
  for (const line of gold) {
    assert.equal(line.source, "hard-case", line.id);
    assert.equal(line.tokens.map((token) => token.s).join(""), line.text, line.id);
    for (const token of line.tokens) {
      const kanji = HAN.test(token.s);
      if (kanji) assert.ok(token.reading === null || typeof token.reading === "string", `${line.id} ${token.s}: a reading or null`);
      else assert.equal(token.reading, undefined, `${line.id} ${token.s}: no reading without kanji`);
      for (const reading of [token.reading, ...token.alternatives]) {
        if (typeof reading === "string") assert.match(reading, /^[ぁ-ゖー]+$/u, `${line.id} ${token.s}`);
      }
      if (token.flag) assert.ok(["name", "counter"].includes(token.flag), `${line.id} ${token.s}`);
    }
  }
  const scored = gold.flatMap((line) => line.tokens).filter((token) => typeof token.reading === "string");
  assert.equal(scored.length, 194);
});

test("the reading scorer: spans both cuts share, alternatives, unscored words, optional counter splits", () => {
  const [line] = parseGold(JSON.stringify({id: "t", source: "hard-case", text: "日本酒は三本と言",
    tokens: [["日本酒", "にほんしゅ"], ["は"], ["三本", "さんぼん", [], "counter"], ["と"], ["言", null]]}));
  const tokens = (pairs: Array<[string, string]>): PredictedToken[] => pairs.map(([s, r]) => ({s, r}));
  // 日本 + 酒 read as one span; 三 / 本 is an allowed split; 言 is not scored.
  const split = scoreLine(line, tokens([["日本", "ニホン"], ["酒", "シュ"], ["は", "ハ"], ["三", "サン"], ["本", "ボン"], ["と", "ト"], ["言", "ゲン"]]));
  assert.deepEqual(split.words.map((word) => [word.word, word.correct]), [["日本酒", true], ["三本", true]]);
  assert.deepEqual([split.truePositives, split.falsePositives, split.falseNegatives], [4, 1, 0]);
  const wrong = scoreLine(line, tokens([["日本", "ニッポン"], ["酒", "シュ"], ["は", "ハ"], ["三本", "サンホン"], ["と", "ト"], ["言", "コト"]]));
  assert.deepEqual(wrong.words.map((word) => [word.word, word.correct, word.predicted]), [["日本酒", false, "にっぽんしゅ"], ["三本", false, "さんほん"]]);
  const [alternative] = parseGold(JSON.stringify({id: "a", source: "hard-case", text: "明日", tokens: [["明日", "あした", ["あす"]]]}));
  assert.ok(scoreLine(alternative, tokens([["明日", "アス"]])).words[0].correct);
  const summary = scoreAll([line, alternative], {t: tokens([["日本酒", "ニホンシュ"], ["は", "ハ"], ["三本", "サンボン"], ["と", "ト"], ["言", ""]]), a: []});
  assert.deepEqual([summary.readings.correct, summary.readings.total, summary.counters.accuracy], [2, 3, 1]);
});

const addonFile = defaultAddonPath(root);
const ipadic = path.join(root, "node_modules", "kuromoji", "dict");
const skip = !fs.existsSync(addonFile)
  ? "build the Node addon first: cargo build --release --manifest-path native/rust/Cargo.toml -p miteiru-node"
  : !fs.existsSync(path.join(ipadic, "base.dat.gz")) ? "needs node_modules/kuromoji/dict (npm ci)" : false;

test("Miteiru's Japanese tokenizer reads the gold set's words right in context", {skip}, async () => {
  const addon = loadAddon(addonFile);
  // IPADIC as kuromoji ships it, the same files as the Japanese pack's; JMdict only joins verb
  // endings into learner units and does not change a reading.
  await addon.japaneseLoad(ipadic, null, false);
  const predictions: Record<string, PredictedToken[]> = {};
  for (let at = 0; at < gold.length; at += 128) {
    const batch = gold.slice(at, at + 128);
    const tokens = JSON.parse(await addon.japaneseTokenizeBatch(ipadic, batch.map((line) => line.text))) as Array<Array<{surface_form: string; reading?: string}>>;
    batch.forEach((line, index) => {
      predictions[line.id] = tokens[index].map((token) => ({s: token.surface_form, r: token.reading ?? ""}));
    });
  }
  const summary = scoreAll(gold, predictions);
  const errors = summary.errors.map((error) => `${error.line} ${error.word}: ${error.predicted} (gold ${error.expected})`).join("\n");
  // Measured 176 of 186 (94.6%); IPADIC alone read 158 (84.9%). See the fixture's README.
  assert.ok(summary.readings.accuracy >= 0.93, `readings ${summary.readings.correct}/${summary.readings.total}\n${errors}`);
  assert.equal(summary.counters.accuracy, 1, errors);
  const read = (id: string, word: string) => {
    const line = gold.find((candidate) => candidate.id === id)!;
    return scoreLine(line, predictions[id]).words.find((result) => result.word === word);
  };
  for (const [id, word, reading] of [
    ["hard-001", "日本酒", "にほんしゅ"],
    ["hard-001", "米", "こめ"],
    ["hard-002", "日米", "にちべい"],
    ["hard-018", "三本", "さんぼん"],
    ["hard-018", "六本", "ろっぽん"],
    ["hard-021", "三日", "みっか"],
    ["hard-007", "一日", "ついたち"],
    ["hard-008", "一日", "いちにち"],
    ["hard-024", "二十歳", "はたち"],
    ["hard-025", "一人", "ひとり"],
    ["hard-025", "二人", "ふたり"],
    ["hard-006", "一日中", "いちにちじゅう"],
    ["hard-051", "行った", "おこなった"],
    ["hard-052", "行った", "いった"],
    ["hard-037", "何人", "なんにん"]
  ] as const) {
    const result = read(id, word);
    assert.ok(result?.correct, `${id} ${word}: ${result?.predicted} (want ${reading})`);
  }
});
