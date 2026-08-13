import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {describe, it} from "node:test";
import {getLanguageFamily, validateDictionary} from "../main/dictionary/validateDictionary";

const baseDocument = (overrides = {}) => ({
  version: "1.0.0",
  language: "en",
  entries: [],
  ...overrides,
});

const validEntry = () => ({
  id: "1",
  headword: "hello",
  readings: ["həˈləʊ"],
  senses: [{gloss: ["a greeting"], partOfSpeech: ["int"]}],
  tags: ["common"],
  frequency: 100,
});

const validJapaneseDocument = () => ({
  version: "1.0.0",
  language: "ja",
  name: "JMdict sample",
  source: {name: "JMdict", url: "https://www.edrdg.org/jmdict/j_jmdict/", license: "CC BY-SA 4.0"},
  entries: [{
    id: "1358280",
    headword: "食べる",
    senses: [{
      partOfSpeech: ["v1", "vt"],
      gloss: [{text: "to eat", lang: "eng"}, "plain string gloss"],
    }],
    japanese: {
      kanji: [{text: "食べる", common: true}],
      kana: [{text: "たべる", common: true, appliesToKanji: ["*"]}],
      kanjiInfo: [{literal: "食", strokeCount: 9, onYomi: ["ショク"], kunYomi: ["た.べる"], jlpt: 5}],
    },
  }],
});

const validMandarinDocument = () => ({
  version: "1.0.0",
  language: "zh-CN",
  entries: [{
    id: 42,
    headword: "你好",
    senses: [{gloss: ["hello"]}],
    mandarin: {simplified: "你好", traditional: "你好", pinyin: ["ni3 hao3", "nǐ hǎo"]},
  }],
});

const validCantoneseDocument = () => ({
  version: "1.0.0",
  language: "yue",
  entries: [{
    id: "7",
    headword: "食",
    senses: [{gloss: ["to eat"]}],
    cantonese: {jyutping: ["sik6"], traditional: "食"},
  }],
});

describe("document level", () => {
  it("accepts a minimal valid document", () => {
    const result = validateDictionary(baseDocument());
    assert.deepEqual(result.errors, []);
    assert.equal(result.valid, true);
  });

  it("requires version, language and entries", () => {
    const result = validateDictionary({});
    const paths = result.errors.map(e => e.path);
    assert.ok(paths.includes("version"));
    assert.ok(paths.includes("language"));
    assert.ok(paths.includes("entries"));
    assert.equal(result.valid, false);
  });

  it("rejects non-semantic versions", () => {
    assert.equal(validateDictionary(baseDocument({version: "1.0"})).valid, false);
    assert.equal(validateDictionary(baseDocument({version: 1})).valid, false);
    assert.equal(validateDictionary(baseDocument({version: "2.1.0"})).valid, true);
  });

  it("rejects malformed language codes", () => {
    assert.equal(validateDictionary(baseDocument({language: "English"})).valid, false);
    assert.equal(validateDictionary(baseDocument({language: "e"})).valid, false);
    assert.equal(validateDictionary(baseDocument({language: "zh-Hans"})).valid, true);
  });

  it("rejects unknown top-level properties", () => {
    const result = validateDictionary(baseDocument({bogus: 1}));
    assert.ok(result.errors.some(e => e.message.includes("bogus")));
  });

  it("validates source metadata", () => {
    assert.equal(validateDictionary(baseDocument({source: {name: "X", license: "CC"}})).valid, true);
    assert.equal(validateDictionary(baseDocument({source: {name: ""}})).valid, false);
    assert.equal(validateDictionary(baseDocument({source: "nope"})).valid, false);
  });

  it("rejects non-object documents", () => {
    assert.equal(validateDictionary([]).valid, false);
    assert.equal(validateDictionary(null).valid, false);
    assert.equal(validateDictionary("doc").valid, false);
  });
});

describe("common entry shape (any language)", () => {
  it("accepts a fully populated generic entry", () => {
    const result = validateDictionary(baseDocument({entries: [validEntry()]}));
    assert.deepEqual(result.errors, []);
  });

  it("requires id and headword", () => {
    const result = validateDictionary(baseDocument({language: "vi", entries: [{}]}));
    const paths = result.errors.map(e => e.path);
    assert.ok(paths.includes("entries[0].id"));
    assert.ok(paths.includes("entries[0].headword"));
  });

  it("rejects bad id values", () => {
    for (const id of ["", -1, 1.5, null]) {
      const result = validateDictionary(baseDocument({entries: [{id, headword: "x"}]}));
      assert.equal(result.valid, false, `id=${JSON.stringify(id)} should be invalid`);
    }
    assert.equal(validateDictionary(baseDocument({entries: [{id: 0, headword: "x"}]})).valid, true);
  });

  it("rejects empty headwords and non-string readings", () => {
    const result = validateDictionary(baseDocument({entries: [{id: "1", headword: "", readings: ["ok", 5]}]}));
    const paths = result.errors.map(e => e.path);
    assert.ok(paths.includes("entries[0].headword"));
    assert.ok(paths.includes("entries[0].readings[1]"));
  });

  it("rejects negative frequency ranks", () => {
    const result = validateDictionary(baseDocument({entries: [{id: "1", headword: "x", frequency: -3}]}));
    assert.ok(result.errors.some(e => e.path === "entries[0].frequency"));
  });

  it("rejects unknown entry properties", () => {
    const result = validateDictionary(baseDocument({entries: [{id: "1", headword: "x", pinyin: ["ni3"]}]}));
    assert.ok(result.errors.some(e => e.message.includes("pinyin")));
  });

  it("reports errors with the entry index in the path", () => {
    const result = validateDictionary(baseDocument({entries: [validEntry(), {id: "2"}]}));
    assert.ok(result.errors.every(e => e.path.startsWith("entries[1]")));
  });
});

describe("senses and glosses", () => {
  it("requires a non-empty gloss array", () => {
    const noGloss = validateDictionary(baseDocument({entries: [{id: "1", headword: "x", senses: [{}]}]}));
    assert.ok(noGloss.errors.some(e => e.path === "entries[0].senses[0].gloss"));
    const emptyGloss = validateDictionary(baseDocument({entries: [{id: "1", headword: "x", senses: [{gloss: []}]}]}));
    assert.equal(emptyGloss.valid, false);
  });

  it("accepts string and object glosses, rejects bad ones", () => {
    const entry = {id: "1", headword: "x", senses: [{gloss: ["ok", {text: "ok", lang: "en"}]}]};
    assert.equal(validateDictionary(baseDocument({entries: [entry]})).valid, true);

    const bad = {id: "1", headword: "x", senses: [{gloss: ["", {text: ""}, {text: "x", lang: "EN!"}, 42]}]};
    const result = validateDictionary(baseDocument({entries: [bad]}));
    assert.ok(result.errors.some(e => e.path === "entries[0].senses[0].gloss[0]"));
    assert.ok(result.errors.some(e => e.path === "entries[0].senses[0].gloss[1].text"));
    assert.ok(result.errors.some(e => e.path === "entries[0].senses[0].gloss[2].lang"));
    assert.ok(result.errors.some(e => e.path === "entries[0].senses[0].gloss[3]"));
  });

  it("validates examples", () => {
    const entry = {id: "1", headword: "x", senses: [{gloss: ["g"], examples: [{text: "例", translation: "ex"}]}]};
    assert.equal(validateDictionary(baseDocument({entries: [entry]})).valid, true);
    const bad = {id: "1", headword: "x", senses: [{gloss: ["g"], examples: [{translation: "missing text"}]}]};
    assert.equal(validateDictionary(baseDocument({entries: [bad]})).valid, false);
  });
});

describe("language family dispatch", () => {
  it("maps language codes to families", () => {
    assert.equal(getLanguageFamily("ja"), "japanese");
    assert.equal(getLanguageFamily("jpn"), "japanese");
    assert.equal(getLanguageFamily("zh"), "mandarin");
    assert.equal(getLanguageFamily("zh-CN"), "mandarin");
    assert.equal(getLanguageFamily("zh-Hans"), "mandarin");
    assert.equal(getLanguageFamily("zh-TW"), "mandarin");
    assert.equal(getLanguageFamily("zh-Hant"), "mandarin");
    assert.equal(getLanguageFamily("cmn"), "mandarin");
    assert.equal(getLanguageFamily("yue"), "cantonese");
    assert.equal(getLanguageFamily("zh-HK"), "cantonese");
    assert.equal(getLanguageFamily("en"), null);
    assert.equal(getLanguageFamily("vi"), null);
    assert.equal(getLanguageFamily(42), null);
  });

  it("rejects an extension from the wrong language", () => {
    const doc = validMandarinDocument();
    doc.entries[0].japanese = {kanji: [{text: "你好"}]};
    const result = validateDictionary(doc);
    assert.ok(result.errors.some(e => e.path === "entries[0].japanese"));
  });

  it("rejects language extensions in generic dictionaries", () => {
    const result = validateDictionary(baseDocument({entries: [{id: "1", headword: "x", cantonese: {jyutping: ["sik6"]}}]}));
    assert.ok(result.errors.some(e => e.path === "entries[0].cantonese"));
  });
});

describe("japanese subschema", () => {
  it("accepts a JMdict-style entry", () => {
    const result = validateDictionary(validJapaneseDocument());
    assert.deepEqual(result.errors, []);
  });

  it("requires partOfSpeech on Japanese senses", () => {
    const doc = validJapaneseDocument();
    delete doc.entries[0].senses[0].partOfSpeech;
    const result = validateDictionary(doc);
    assert.ok(result.errors.some(e => e.path === "entries[0].senses[0].partOfSpeech"));
  });

  it("validates kanji/kana forms", () => {
    const doc = validJapaneseDocument();
    doc.entries[0].japanese.kanji = [{text: ""}];
    doc.entries[0].japanese.kana = [{text: "たべる", appliesToKanji: "not-an-array"}];
    const result = validateDictionary(doc);
    assert.ok(result.errors.some(e => e.path === "entries[0].japanese.kanji[0].text"));
    assert.ok(result.errors.some(e => e.path === "entries[0].japanese.kana[0].appliesToKanji"));
  });

  it("validates kanjiInfo ranges", () => {
    const doc = validJapaneseDocument();
    doc.entries[0].japanese.kanjiInfo = [{literal: "食", strokeCount: 0, jlpt: 9}];
    const result = validateDictionary(doc);
    assert.ok(result.errors.some(e => e.path.includes("strokeCount")));
    assert.ok(result.errors.some(e => e.path.includes("jlpt")));
  });
});

describe("mandarin subschema", () => {
  it("accepts a CC-CEDICT-style entry", () => {
    assert.deepEqual(validateDictionary(validMandarinDocument()).errors, []);
  });

  it("requires the mandarin extension", () => {
    const doc = validMandarinDocument();
    delete doc.entries[0].mandarin;
    const result = validateDictionary(doc);
    assert.ok(result.errors.some(e => e.path === "entries[0].mandarin"));
  });

  it("requires simplified and pinyin inside the extension", () => {
    const doc = validMandarinDocument();
    doc.entries[0].mandarin = {};
    const result = validateDictionary(doc);
    const paths = result.errors.map(e => e.path);
    assert.ok(paths.includes("entries[0].mandarin.simplified"));
    assert.ok(paths.includes("entries[0].mandarin.pinyin"));
  });

  it("validates pinyin tone numbers", () => {
    const doc = validMandarinDocument();
    doc.entries[0].mandarin.pinyin = ["ni3 hao6", "123", "shi4 de"];
    const result = validateDictionary(doc);
    assert.ok(result.errors.some(e => e.path === "entries[0].mandarin.pinyin[0]"));
    assert.ok(result.errors.some(e => e.path === "entries[0].mandarin.pinyin[1]"));
    assert.ok(!result.errors.some(e => e.path === "entries[0].mandarin.pinyin[2]"));
  });
});

describe("cantonese subschema", () => {
  it("accepts a CantoDict-style entry", () => {
    assert.deepEqual(validateDictionary(validCantoneseDocument()).errors, []);
  });

  it("requires jyutping", () => {
    const doc = validCantoneseDocument();
    doc.entries[0].cantonese = {};
    const result = validateDictionary(doc);
    assert.ok(result.errors.some(e => e.path === "entries[0].cantonese.jyutping"));
  });

  it("rejects jyutping tones outside 1-6", () => {
    const doc = validCantoneseDocument();
    doc.entries[0].cantonese.jyutping = ["sik7"];
    const result = validateDictionary(doc);
    assert.ok(result.errors.some(e => e.path === "entries[0].cantonese.jyutping[0]"));
  });

  it("accepts multi-syllable jyutping", () => {
    const doc = validCantoneseDocument();
    doc.entries[0].cantonese.jyutping = ["sik6 faan6"];
    assert.equal(validateDictionary(doc).valid, true);
  });
});

describe("schema document sanity", () => {
  it("dictionary.schema.json is valid JSON with the expected subschemas", () => {
    const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../main/dictionary/dictionary.schema.json");
    const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    for (const def of ["entry", "sense", "gloss", "japaneseExtension", "mandarinExtension", "cantoneseExtension", "japaneseEntry", "mandarinEntry", "cantoneseEntry"]) {
      assert.ok(schema.$defs[def], `missing $defs.${def}`);
    }
    assert.equal(schema.allOf.length, 4);
  });
});
