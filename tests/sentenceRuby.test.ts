import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
  buildSentenceRubyHtmlFromSegments,
  normalizeSentenceRubySegments
} from "../renderer/utils/sentenceRuby";

describe("normalizeSentenceRubySegments", () => {
  it("accepts text/reading pairs", () => {
    assert.deepEqual(
      normalizeSentenceRubySegments([{text: "食べる", reading: "たべる"}]),
      [{text: "食べる", reading: "たべる"}]
    );
  });

  it("falls back to surface when text is missing", () => {
    assert.deepEqual(
      normalizeSentenceRubySegments([{surface: "食べる", reading: "たべる"}]),
      [{text: "食べる", reading: "たべる"}]
    );
  });

  it("drops entries without text and non-object items", () => {
    assert.deepEqual(
      normalizeSentenceRubySegments([null, "str", 42, {reading: "x"}, {text: ""}, {text: "ok"}]),
      [{text: "ok", reading: ""}]
    );
  });

  it("trims readings and tolerates non-string readings", () => {
    assert.deepEqual(
      normalizeSentenceRubySegments([{text: "a", reading: "  r  "}, {text: "b", reading: 5}]),
      [{text: "a", reading: "r"}, {text: "b", reading: ""}]
    );
  });

  it("returns [] for non-arrays", () => {
    assert.deepEqual(normalizeSentenceRubySegments("nope"), []);
    assert.deepEqual(normalizeSentenceRubySegments(null), []);
  });
});

describe("buildSentenceRubyHtmlFromSegments", () => {
  it("wraps segments with readings in ruby tags", () => {
    assert.equal(
      buildSentenceRubyHtmlFromSegments([{text: "食", reading: "た"}, {text: "べる", reading: ""}]),
      "<ruby>食<rt>た</rt></ruby>べる"
    );
  });

  it("skips ruby when reading equals text", () => {
    assert.equal(buildSentenceRubyHtmlFromSegments([{text: "abc", reading: "abc"}]), "abc");
  });

  it("escapes HTML in text and reading", () => {
    assert.equal(
      buildSentenceRubyHtmlFromSegments([{text: "<b>", reading: "<i>"}]),
      "<ruby>&lt;b&gt;<rt>&lt;i&gt;</rt></ruby>"
    );
  });
});
