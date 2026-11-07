import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {rubyHtmlToPlainText} from "../renderer/utils/rubyText";
import {ankiSavedMessage, fileNameOf} from "../renderer/utils/ankiNotice";
import {isAutoKnown, savedLevelOf, SAVE_LEVELS} from "../renderer/utils/vocabSaveLevels";

describe("rubyHtmlToPlainText", () => {
  it("puts the reading in parentheses after the word", () => {
    assert.equal(rubyHtmlToPlainText("<ruby>食<rt>た</rt></ruby>べる"), "食(た)べる");
  });

  it("handles several words and drops empty or repeated readings", () => {
    assert.equal(
      rubyHtmlToPlainText("<ruby>日本<rt>にほん</rt></ruby><ruby>の<rt></rt></ruby><ruby>こと<rt>こと</rt></ruby>"),
      "日本(にほん)のこと"
    );
  });

  it("decodes entities and strips other tags and rp", () => {
    assert.equal(rubyHtmlToPlainText("<ruby>a&amp;b<rp>(</rp><rt>x&lt;y</rt><rp>)</rp></ruby> <b>ok</b>"), "a&b(x<y) ok");
  });

  it("returns an empty string for nothing", () => {
    assert.equal(rubyHtmlToPlainText(""), "");
  });
});

describe("ankiSavedMessage", () => {
  it("names the file and the next step", () => {
    assert.equal(fileNameOf("C:\\Users\\a\\anki\\japanese-words.txt"), "japanese-words.txt");
    assert.equal(
      ankiSavedMessage("/home/a/japanese-words.txt"),
      "Saved japanese-words.txt · In Anki: File → Import, then pick this file"
    );
  });
});

describe("save levels", () => {
  it("offers New, Learning and Known", () => {
    assert.deepEqual(SAVE_LEVELS.map((l) => l.label), ["New", "Learning", "Known"]);
  });

  it("shows an automatically known word as Known", () => {
    assert.equal(isAutoKnown(3), true);
    assert.equal(isAutoKnown(2), false);
    assert.equal(savedLevelOf(3), 2);
    assert.equal(savedLevelOf(1), 1);
  });
});
