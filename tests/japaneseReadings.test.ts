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

const addonFile = process.env.MITEIRU_NODE_ADDON || defaultAddonPath(root);
const ipadic = process.env.MITEIRU_IPADIC_DIR || path.join(root, "renderer/public/language-assets/japanese/dict");
const skip = !fs.existsSync(addonFile)
  ? "build the Node addon first: cargo build --release --manifest-path native/rust/Cargo.toml -p miteiru-node"
  : !["base.dat", "base.dat.gz", "base.dat.zst"].some((file) => fs.existsSync(path.join(ipadic, file)))
    ? "needs the Japanese language assets or MITEIRU_IPADIC_DIR" : false;

// Columns are 1–10, 100, 1000, and 何. Use digits as well as kanji: 百足 can be the single word
// むかで, but 100足 is a count. A dash marks a count outside the native series or a calendar month.
const counterTable = `
杯 イッパイ ニハイ サンバイ ヨンハイ ゴハイ ロッパイ ナナハイ ハッパイ キュウハイ ジュッパイ ヒャッパイ センバイ ナンバイ
匹 イッピキ ニヒキ サンビキ ヨンヒキ ゴヒキ ロッピキ ナナヒキ ハッピキ キュウヒキ ジュッピキ ヒャッピキ センビキ ナンビキ
本 イッポン ニホン サンボン ヨンホン ゴホン ロッポン ナナホン ハッポン キュウホン ジュッポン ヒャッポン センボン ナンボン
分 イップン ニフン サンプン ヨンプン ゴフン ロップン ナナフン ハップン キュウフン ジュップン ヒャップン センプン ナンプン
回 イッカイ ニカイ サンカイ ヨンカイ ゴカイ ロッカイ ナナカイ ハッカイ キュウカイ ジュッカイ ヒャッカイ センカイ ナンカイ
階 イッカイ ニカイ サンガイ ヨンカイ ゴカイ ロッカイ ナナカイ ハッカイ キュウカイ ジュッカイ ヒャッカイ センカイ ナンガイ
軒 イッケン ニケン サンゲン ヨンケン ゴケン ロッケン ナナケン ハッケン キュウケン ジュッケン ヒャッケン センケン ナンゲン
個 イッコ ニコ サンコ ヨンコ ゴコ ロッコ ナナコ ハッコ キュウコ ジュッコ ヒャッコ センコ ナンコ
歳 イッサイ ニサイ サンサイ ヨンサイ ゴサイ ロクサイ ナナサイ ハッサイ キュウサイ ジュッサイ ヒャクサイ センサイ ナンサイ
冊 イッサツ ニサツ サンサツ ヨンサツ ゴサツ ロクサツ ナナサツ ハッサツ キュウサツ ジュッサツ ヒャクサツ センサツ ナンサツ
足 イッソク ニソク サンゾク ヨンソク ゴソク ロクソク ナナソク ハッソク キュウソク ジュッソク ヒャクソク センゾク ナンゾク
着 イッチャク ニチャク サンチャク ヨンチャク ゴチャク ロクチャク ナナチャク ハッチャク キュウチャク ジュッチャク ヒャクチャク センチャク ナンチャク
台 イチダイ ニダイ サンダイ ヨンダイ ゴダイ ロクダイ ナナダイ ハチダイ キュウダイ ジュウダイ ヒャクダイ センダイ ナンダイ
枚 イチマイ ニマイ サンマイ ヨンマイ ゴマイ ロクマイ ナナマイ ハチマイ キュウマイ ジュウマイ ヒャクマイ センマイ ナンマイ
人 ヒトリ フタリ サンニン ヨニン ゴニン ロクニン ナナニン ハチニン キュウニン ジュウニン ヒャクニン センニン ナンニン
日 イチニチ フツカ ミッカ ヨッカ イツカ ムイカ ナノカ ヨウカ ココノカ トオカ ヒャクニチ センニチ ナンニチ
月 イチガツ ニガツ サンガツ シガツ ゴガツ ロクガツ シチガツ ハチガツ クガツ ジュウガツ - - ナンガツ
つ ヒトツ フタツ ミッツ ヨッツ イツツ ムッツ ナナツ ヤッツ ココノツ - - - -
時 イチジ ニジ サンジ ヨジ ゴジ ロクジ シチジ ハチジ クジ ジュウジ ヒャクジ センジ ナンジ
頭 イットウ ニトウ サントウ ヨントウ ゴトウ ロクトウ ナナトウ ハットウ キュウトウ ジュットウ ヒャクトウ セントウ ナントウ
羽 イチワ ニワ サンバ ヨンワ ゴワ ロッパ ナナワ ハッパ キュウワ ジュッパ ヒャッパ センバ ナンバ
件 イッケン ニケン サンケン ヨンケン ゴケン ロッケン ナナケン ハッケン キュウケン ジュッケン ヒャッケン センケン ナンケン
度 イチド ニド サンド ヨンド ゴド ロクド ナナド ハチド キュウド ジュウド ヒャクド センド ナンド
番 イチバン ニバン サンバン ヨンバン ゴバン ロクバン ナナバン ハチバン キュウバン ジュウバン ヒャクバン センバン ナンバン
発 イッパツ ニハツ サンパツ ヨンパツ ゴハツ ロッパツ ナナハツ ハッパツ キュウハツ ジュッパツ ヒャッパツ センパツ ナンパツ
泊 イッパク ニハク サンパク ヨンパク ゴハク ロッパク ナナハク ハッパク キュウハク ジュッパク ヒャッパク センパク ナンパク
皿 ヒトサラ フタサラ サンサラ ヨンサラ ゴサラ ロクサラ ナナサラ ハチサラ キュウサラ ジュウサラ ヒャクサラ センサラ ナンサラ
箱 ヒトハコ フタハコ サンハコ ヨンハコ ゴハコ ロクハコ ナナハコ ハチハコ キュウハコ ジュウハコ ヒャクハコ センハコ ナンハコ
袋 ヒトフクロ フタフクロ サンフクロ ヨンフクロ ゴフクロ ロクフクロ ナナフクロ ハチフクロ キュウフクロ ジュウフクロ ヒャクフクロ センフクロ ナンフクロ
週間 イッシュウカン ニシュウカン サンシュウカン ヨンシュウカン ゴシュウカン ロクシュウカン ナナシュウカン ハッシュウカン キュウシュウカン ジュッシュウカン ヒャクシュウカン センシュウカン ナンシュウカン
年 イチネン ニネン サンネン ヨネン ゴネン ロクネン ナナネン ハチネン キュウネン ジュウネン ヒャクネン センネン ナンネン
ページ イッページ ニページ サンページ ヨンページ ゴページ ロッページ ナナページ ハッページ キュウページ ジュッページ ヒャッページ センページ ナンページ
`.trim();

test("the addon reads numeral and counter pairs in digits and kanji", {skip}, async () => {
  const addon = loadAddon(addonFile);
  await addon.japaneseLoad(ipadic, null, false);
  const digits = "1 2 3 4 5 6 7 8 9 10 100 1000".split(" ");
  for (const row of counterTable.split("\n")) {
    const [unit, ...expected] = row.split(" ");
    const numbers = [...digits, ..."一二三四五六七八九十百千何"];
    const words = numbers.map((n) => n + unit);
    const batch = JSON.parse(await addon.japaneseTokenizeBatch(ipadic, words));
    for (const [index, word] of words.entries()) {
      const tokens = batch[index];
      if (index >= digits.length && tokens.length === 1) {
        assert.equal(tokens[0].surface_form, word);
        assert.equal(tokens[0].counter_reading, undefined);
        continue;
      }
      assert.deepEqual(tokens.map((token) => token.surface_form), [numbers[index], unit], word);
      const pair = tokens[1].counter_reading;
      assert.equal(pair ? pair.number + pair.counter : "-", expected[index < digits.length ? index : index - digits.length], word);
    }
  }
});

test("Miteiru's Japanese tokenizer reads the gold set's words right in context", {skip}, async () => {
  const addon = loadAddon(addonFile);
  // Use the Japanese pack's IPADIC on its own to measure readings independently of JMdict.
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
