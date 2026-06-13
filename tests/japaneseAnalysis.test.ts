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
