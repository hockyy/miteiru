import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {describe, it} from "node:test";
import Ajv2020 from "ajv/dist/2020";
import {validateDictionary} from "../main/dictionary/validateDictionary";

const schemaPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../main/dictionary/dictionary.schema.json"
);
const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
const ajv = new Ajv2020({strict: false, allErrors: true});
const ajvValidate = ajv.compile(schema);

const validGeneric = {
  version: "1.0.0",
  language: "en",
  entries: [{id: "1", headword: "hello", senses: [{gloss: ["a greeting"]}]}],
};

const validJapanese = {
  version: "1.0.0",
  language: "ja",
  entries: [{
    id: "1358280",
    headword: "食べる",
    senses: [{partOfSpeech: ["v1"], gloss: [{text: "to eat", lang: "eng"}]}],
    japanese: {
      kanji: [{text: "食べる", common: true}],
      kana: [{text: "たべる", appliesToKanji: ["*"]}],
      kanjiInfo: [{literal: "食", strokeCount: 9, jlpt: 5}],
    },
  }],
};

const validMandarin = {
  version: "1.0.0",
  language: "zh-CN",
  entries: [{
    id: 42,
    headword: "你好",
    senses: [{gloss: ["hello"]}],
    mandarin: {simplified: "你好", traditional: "你好", pinyin: ["ni3 hao3"]},
  }],
};

const validCantonese = {
  version: "1.0.0",
  language: "yue",
  entries: [{
    id: "7",
    headword: "食",
    senses: [{gloss: ["to eat"]}],
    cantonese: {jyutping: ["sik6"]},
  }],
};

const fixtures: [string, unknown][] = [
  ["valid generic", validGeneric],
  ["valid japanese", validJapanese],
  ["valid mandarin", validMandarin],
  ["valid cantonese", validCantonese],
  ["valid empty entries", {version: "1.0.0", language: "vi", entries: []}],
  ["missing version", {language: "en", entries: []}],
  ["missing language", {version: "1.0.0", entries: []}],
  ["missing entries", {version: "1.0.0", language: "en"}],
  ["bad version", {version: "1.0", language: "en", entries: []}],
  ["bad language code", {version: "1.0.0", language: "English", entries: []}],
  ["extra top-level key", {...validGeneric, bogus: 1}],
  ["missing headword", {version: "1.0.0", language: "en", entries: [{id: "1"}]}],
  ["empty headword", {version: "1.0.0", language: "en", entries: [{id: "1", headword: ""}]}],
  ["negative id", {version: "1.0.0", language: "en", entries: [{id: -1, headword: "x"}]}],
  ["negative frequency", {version: "1.0.0", language: "en", entries: [{id: "1", headword: "x", frequency: -1}]}],
  ["extra entry key", {version: "1.0.0", language: "en", entries: [{id: "1", headword: "x", pinyin: []}]}],
  ["empty gloss array", {version: "1.0.0", language: "en", entries: [{id: "1", headword: "x", senses: [{gloss: []}]}]}],
  ["gloss bad lang", {version: "1.0.0", language: "en", entries: [{id: "1", headword: "x", senses: [{gloss: [{text: "g", lang: "EN!"}]}]}]}],
  ["japanese sense without partOfSpeech", {
    version: "1.0.0", language: "ja",
    entries: [{id: "1", headword: "x", senses: [{gloss: ["g"]}]}],
  }],
  ["japanese bad kanjiInfo jlpt", {
    version: "1.0.0", language: "ja",
    entries: [{id: "1", headword: "x", japanese: {kanjiInfo: [{literal: "食", jlpt: 9}]}}],
  }],
  ["mandarin missing extension", {
    version: "1.0.0", language: "zh-CN",
    entries: [{id: "1", headword: "你好"}],
  }],
  ["mandarin bad pinyin tone", {
    version: "1.0.0", language: "zh",
    entries: [{id: "1", headword: "你好", mandarin: {simplified: "你好", pinyin: ["hao6"]}}],
  }],
  ["cantonese missing jyutping", {
    version: "1.0.0", language: "yue",
    entries: [{id: "1", headword: "食", cantonese: {traditional: "食"}}],
  }],
  ["cantonese bad jyutping tone", {
    version: "1.0.0", language: "zh-HK",
    entries: [{id: "1", headword: "食", cantonese: {jyutping: ["sik7"]}}],
  }],
  ["wrong-family extension", {
    version: "1.0.0", language: "ja",
    entries: [{id: "1", headword: "x", mandarin: {simplified: "x", pinyin: ["ni3"]}}],
  }],
  ["extension in generic dictionary", {
    version: "1.0.0", language: "en",
    entries: [{id: "1", headword: "x", cantonese: {jyutping: ["sik6"]}}],
  }],
];

describe("dictionary schema parity (ajv vs hand-rolled validator)", () => {
  for (const [name, document] of fixtures) {
    it(`agrees on: ${name}`, () => {
      const ajvResult = Boolean(ajvValidate(document));
      const ownResult = validateDictionary(document);
      assert.equal(
        ownResult.valid,
        ajvResult,
        `ajv=${ajvResult} but validator=${ownResult.valid}; ` +
        `ajv errors: ${JSON.stringify(ajvValidate.errors)}; ` +
        `validator errors: ${JSON.stringify(ownResult.errors)}`
      );
    });
  }
});
