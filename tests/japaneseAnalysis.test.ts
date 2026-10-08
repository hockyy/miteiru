import assert from "node:assert/strict";
import {test} from "node:test";
import {processKuromojinToSeparations} from "../main/handler/languages/japaneseAnalysis";

test("processKuromojinToSeparations returns Miteiru Japanese token shape", () => {
  const tokens = processKuromojinToSeparations([
    {
      word_id: 1,
      word_type: "KNOWN",
      word_position: 1,
      surface_form: "見",
      pos: "動詞",
      pos_detail_1: "自立",
      pos_detail_2: "*",
      pos_detail_3: "*",
      conjugated_type: "*",
      conjugated_form: "*",
      basic_form: "見る",
      reading: "ミ",
      pronunciation: "ミ"
    },
    {
      word_id: 2,
      word_type: "KNOWN",
      word_position: 2,
      surface_form: "た",
      pos: "助動詞",
      pos_detail_1: "*",
      pos_detail_2: "*",
      pos_detail_3: "*",
      conjugated_type: "*",
      conjugated_form: "*",
      basic_form: "た",
      reading: "タ",
      pronunciation: "タ"
    }
  ]);

  assert.equal(tokens.length, 2);
  assert.deepEqual(tokens[0], {
    origin: "見",
    hiragana: "み",
    basicForm: "見る",
    pos: "動詞-自立",
    separation: [
      {
        main: "見",
        hiragana: "み",
        romaji: "mi",
        isKana: false,
        isKanji: true,
        isMixed: false
      }
    ]
  });
  assert.equal(tokens[1].separation[0].main, "た");
  assert.equal(tokens[1].separation[0].hiragana, "た");
});

const kuromojiToken = (
  surface_form: string,
  reading: string | undefined,
  pronunciation: string | undefined,
  pos = "名詞"
) => ({
  word_id: 0,
  word_type: reading === undefined ? "UNKNOWN" : "KNOWN",
  word_position: 1,
  surface_form,
  pos,
  pos_detail_1: "*",
  pos_detail_2: "*",
  pos_detail_3: "*",
  conjugated_type: "*",
  conjugated_form: "*",
  basic_form: surface_form,
  reading,
  pronunciation
});

test("processKuromojinToSeparations takes furigana from the dictionary reading, not the pronunciation", () => {
  const tokens = processKuromojinToSeparations([
    kuromojiToken("大きい", "オオキイ", "オーキイ", "形容詞"),
    kuromojiToken("通り", "トオリ", "トーリ"),
    kuromojiToken("大阪", "オオサカ", "オーサカ"),
    kuromojiToken("先生", "センセイ", "センセー"),
    kuromojiToken("ホーム", "ホーム", "ホーム"),
  ]);

  assert.deepEqual(tokens.map((token) => token.hiragana), ["おおきい", "とおり", "おおさか", "せんせい", "ほーむ"]);
  assert.deepEqual(tokens[0].separation.map(({main, hiragana, romaji}) => [main, hiragana, romaji]), [
    ["大", "おお", "oo"],
    ["きい", "きい", "kii"],
  ]);
  assert.deepEqual(tokens[1].separation.map(({main, hiragana}) => [main, hiragana]), [
    ["通", "とお"],
    ["り", "り"],
  ]);
  assert.equal(tokens[3].separation[0].romaji, "sensei");
  assert.equal(tokens[4].separation[0].romaji, "hoomu");
});

test("processKuromojinToSeparations keeps pronunciation-based romaji for particles", () => {
  const tokens = processKuromojinToSeparations([
    kuromojiToken("は", "ハ", "ワ", "助詞"),
    kuromojiToken("へ", "ヘ", "エ", "助詞"),
    kuromojiToken("こんにちは", "コンニチハ", "コンニチワ", "感動詞"),
  ]);

  assert.deepEqual(tokens.map((token) => token.hiragana), ["は", "へ", "こんにちは"]);
  assert.deepEqual(tokens.map((token) => token.separation[0].romaji), ["wa", "e", "konnichiwa"]);
});

test("processKuromojinToSeparations leaves unknown words without a reading", () => {
  const [token] = processKuromojinToSeparations([kuromojiToken("拉", undefined, undefined)]);

  assert.equal(token.hiragana, "");
  assert.deepEqual(token.separation.map(({main, hiragana, romaji}) => [main, hiragana, romaji]), [["拉", "", ""]]);
});
