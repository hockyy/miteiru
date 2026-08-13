import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {asString, asStringArray, extractJsonString} from "../renderer/utils/parseJsonResponse";

describe("asString", () => {
  it("trims strings and rejects non-strings", () => {
    assert.equal(asString("  hello  "), "hello");
    assert.equal(asString(42), "");
    assert.equal(asString(null), "");
    assert.equal(asString(undefined), "");
    assert.equal(asString(["a"]), "");
  });
});

describe("asStringArray", () => {
  it("keeps non-empty trimmed strings", () => {
    assert.deepEqual(asStringArray([" a ", "", "b", "   "]), ["a", "b"]);
  });

  it("coerces non-string entries to empty and drops them", () => {
    assert.deepEqual(asStringArray(["a", 1, null, {}, "b"]), ["a", "b"]);
  });

  it("returns [] for non-arrays", () => {
    assert.deepEqual(asStringArray("nope"), []);
    assert.deepEqual(asStringArray(null), []);
    assert.deepEqual(asStringArray(undefined), []);
  });
});

describe("extractJsonString", () => {
  it("extracts JSON from fenced code blocks", () => {
    assert.equal(extractJsonString('```json\n{"a": 1}\n```'), '{"a": 1}');
    assert.equal(extractJsonString('```\n{"a": 1}\n```'), '{"a": 1}');
    assert.equal(extractJsonString('Here you go:\n```JSON\n{"a": 1}\n```\nDone'), '{"a": 1}');
  });

  it("falls back to the outermost braces when unfenced", () => {
    assert.equal(extractJsonString('prefix {"a": 1} suffix'), '{"a": 1}');
    assert.equal(extractJsonString('{"a": 1}'), '{"a": 1}');
  });

  it("returns null for empty or non-JSON input", () => {
    assert.equal(extractJsonString(""), null);
    assert.equal(extractJsonString("   "), null);
    assert.equal(extractJsonString("no json here"), null);
  });
});
