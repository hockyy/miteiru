import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
  buildRubyHtmlFromRomajiedData,
  getDictionaryDefinitions,
  getPrimaryRomajiedVariant,
  getReadingsFromRomajiedData,
  buildJapaneseHeadwordToken,
  getJapaneseHeadwords,
  pickJapaneseReading,
} from "../renderer/components/Meaning/meaningEntries";
import {videoConstants} from "../renderer/utils/constants";

describe("getReadingsFromRomajiedData", () => {
  it("collects unique non-empty readings from separated tokens", () => {
    const data = [{
      romajied: [
        {separation: [{hiragana: "た"}, {hiragana: "べ"}, {hiragana: "た"}]},
        {hiragana: "る"},
      ]
    }];
    assert.deepEqual(getReadingsFromRomajiedData(data), ["た", "べ", "る"]);
  });

  it("falls back through romaji/pinyin/jyutping and skips junk", () => {
    const data = [{
      romajied: [
        {romaji: "taberu"},
        {pinyin: "chi1"},
        {jyutping: "sik6"},
        null,
        "plain-string",
        {},
      ]
    }];
    assert.deepEqual(getReadingsFromRomajiedData(data), ["taberu", "chi1", "sik6"]);
  });

  it("handles missing romajied arrays", () => {
    assert.deepEqual(getReadingsFromRomajiedData([{}, {romajied: null}]), []);
  });
});

describe("buildRubyHtmlFromRomajiedData", () => {
  it("builds ruby tags with hiragana readings for Japanese", () => {
    const html = buildRubyHtmlFromRomajiedData([{
      romajied: [{hiragana: "たべる", separation: [{main: "食", hiragana: "た"}, {main: "べる"}]}]
    }]);
    assert.equal(html, "<ruby>食<rt>た</rt></ruby><ruby>べる<rt></rt></ruby>");
  });

  it("prefers jyutping then pinyin for Chinese tokens", () => {
    const html = buildRubyHtmlFromRomajiedData([{
      romajied: [{jyutping: "sik6", separation: [{main: "食", jyutping: "sik6", pinyin: "shi2"}]}]
    }]);
    assert.equal(html, "<ruby>食<rt>sik6</rt></ruby>");
  });

  it("appends plain token origins without ruby", () => {
    const html = buildRubyHtmlFromRomajiedData([{romajied: [{origin: "。"}, "raw"]}]);
    assert.equal(html, "。raw");
  });

  it("escapes HTML in surfaces and readings", () => {
    const html = buildRubyHtmlFromRomajiedData([{
      romajied: [{hiragana: "x", separation: [{main: "<script>alert(1)</script>", hiragana: "<b>"}]}]
    }]);
    assert.equal(
      html,
      "<ruby>&lt;script&gt;alert(1)&lt;/script&gt;<rt>&lt;b&gt;</rt></ruby>"
    );
  });

  it("escapes HTML in plain token origins", () => {
    const html = buildRubyHtmlFromRomajiedData([{romajied: [{origin: "<img src=x onerror=alert(1)>"}]}]);
    assert.equal(html, "&lt;img src=x onerror=alert(1)&gt;");
  });
});

describe("getPrimaryRomajiedVariant", () => {
  it("returns only the first variant", () => {
    const a = {romajied: []};
    const b = {romajied: []};
    assert.deepEqual(getPrimaryRomajiedVariant([a, b]), [a]);
  });

  it("returns [] for empty or invalid input", () => {
    assert.deepEqual(getPrimaryRomajiedVariant([]), []);
    assert.deepEqual(getPrimaryRomajiedVariant(null), []);
  });
});

describe("getDictionaryDefinitions", () => {
  it("flattens nested meaning arrays for Chinese/Vietnamese", () => {
    const content = {meaning: [["to eat", "to consume"], "food"]};
    assert.deepEqual(getDictionaryDefinitions(content, videoConstants.chineseLang), ["to eat", "to consume", "food"]);
    assert.deepEqual(getDictionaryDefinitions(content, videoConstants.cantoneseLang), ["to eat", "to consume", "food"]);
    assert.deepEqual(getDictionaryDefinitions(content, videoConstants.vietnameseLang), ["to eat", "to consume", "food"]);
  });

  it("extracts gloss text from Japanese senses", () => {
    const content = {sense: [{gloss: [{text: "to eat"}, {text: "meal"}]}, {gloss: [{text: "food"}]}]};
    assert.deepEqual(getDictionaryDefinitions(content, videoConstants.japaneseLang), ["to eat", "meal", "food"]);
  });

  it("drops malformed glosses instead of returning undefined entries", () => {
    const content = {sense: [{gloss: [{text: "real"}, {}, null]}, {gloss: null}, null]};
    assert.deepEqual(getDictionaryDefinitions(content, videoConstants.japaneseLang), ["real"]);
  });

  it("returns [] when nothing is available", () => {
    assert.deepEqual(getDictionaryDefinitions({}, videoConstants.japaneseLang), []);
    assert.deepEqual(getDictionaryDefinitions(null, videoConstants.chineseLang), []);
    assert.deepEqual(getDictionaryDefinitions(undefined, videoConstants.japaneseLang), []);
  });
});

describe("Japanese headwords", () => {
  const kana = (text: string, appliesToKanji: string[] = ["*"]) => ({text, common: true, tags: [], appliesToKanji});
  const kanji = (text: string) => ({text, common: true, tags: []});
  const sense = (misc: string[] = []) => ({misc, gloss: [], partOfSpeech: []});

  it("picks the first kana that applies to a spelling", () => {
    const entry = {kana: [kana("おる", ["居る"]), kana("いる", ["*"])], kanji: [kanji("居る"), kanji("要る")]};
    assert.equal(pickJapaneseReading(entry, "居る"), "おる");
    assert.equal(pickJapaneseReading(entry, "要る"), "いる");
    assert.equal(pickJapaneseReading({kana: [kana("みな", [])]}, "皆"), "みな");
    assert.equal(pickJapaneseReading({kana: []}, "皆"), undefined);
  });

  it("shows each kanji spelling with its own kana", () => {
    const entry = {kana: [kana("たべる")], kanji: [kanji("食べる")], sense: [sense()]};
    assert.deepEqual(getJapaneseHeadwords(entry, "食べる"), [
      {text: "食べる", common: true, tags: [], key: 0, reading: "たべる"},
    ]);
  });

  it("shows the clicked kana, not the kanji, for words usually written in kana", () => {
    const entry = {kana: [kana("ちょっと")], kanji: [kanji("一寸"), kanji("鳥渡")], sense: [sense(["uk"])]};
    const [only, ...rest] = getJapaneseHeadwords(entry, "ちょっと");
    assert.equal(rest.length, 0);
    assert.equal(only.text, "ちょっと");
    assert.equal(only.reading, "ちょっと");
    // Clicking the kanji spelling still shows kanji, now with the right reading.
    assert.equal(getJapaneseHeadwords(entry, "一寸")[0].reading, "ちょっと");
  });

  it("shows the matching kana of an entry that has no kanji", () => {
    const entry = {kana: [kana("ありがとう"), kana("ありがと")], kanji: [], sense: [sense()]};
    assert.equal(getJapaneseHeadwords(entry, "ありがと")[0].text, "ありがと");
    assert.equal(getJapaneseHeadwords(entry, "ありが")[0].text, "ありがとう");
  });

  it("keeps the term when there is no entry data", () => {
    assert.deepEqual(getJapaneseHeadwords({kana: [], kanji: []}, "エレン"), [{text: "エレン", key: 0}]);
  });

  it("builds a token with the okurigana split from the dictionary reading", () => {
    const token = buildJapaneseHeadwordToken("食べる", "たべる");
    assert.equal(token.origin, "食べる");
    assert.equal(token.hiragana, "たべる");
    assert.deepEqual(token.separation.map(({main, hiragana}) => [main, hiragana]), [["食", "た"], ["べる", "べる"]]);
    assert.deepEqual(buildJapaneseHeadwordToken("一寸", "ちょっと").separation.map(({main, hiragana}) => [main, hiragana]), [["一寸", "ちょっと"]]);
    assert.equal(buildJapaneseHeadwordToken("コーヒー", "コーヒー").hiragana, "こーひー");
  });
});
