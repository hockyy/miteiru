import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {asString, asStringArray, extractJsonArray, extractJsonString} from "../renderer/utils/parseJsonResponse";

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

describe("extractJsonArray", () => {
  it("reads fenced, raw and prose-wrapped arrays", () => {
  assert.equal(extractJsonArray('```json\n[{"i":1,"en":"hi"}]\n```'), '[{"i":1,"en":"hi"}]');
  assert.equal(extractJsonArray('Here you go: [{"i":2}] done'), '[{"i":2}]');
  assert.equal(extractJsonArray('[]'), '[]');
  assert.equal(extractJsonArray('{"not": "an array"}'), null);
  assert.equal(extractJsonArray('   '), null);
  // Brackets in the prose before the array, a JSON object payload, and an explanation fence first.
  assert.equal(extractJsonArray('Note [1]: here is the list [{"i":1}]'), '[{"i":1}]');
  assert.equal(extractJsonArray('{"cues": [1, 2]}'), null);
  assert.equal(extractJsonArray('```text\nThinking\n```\n```json\n[{"i":3}]\n```'), '[{"i":3}]');
  assert.equal(extractJsonArray('[1, 2,]'), null);
  });
});
