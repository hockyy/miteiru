import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
  buildRubyHtmlFromRomajiedData,
  getDictionaryDefinitions,
  getPrimaryRomajiedVariant,
  getReadingsFromRomajiedData
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
