import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSentenceAnkiBack } from "../renderer/utils/parseSentenceAnkiBack";

test("parseSentenceAnkiBack parses fenced JSON", () => {
  const raw = `\`\`\`json
{
  "translation": "I am going to the store.",
  "note": "Uses 行く for movement toward a destination."
}
\`\`\``;

  const parsed = parseSentenceAnkiBack(raw);
  assert.ok(parsed);
  assert.equal(parsed.translation, "I am going to the store.");
  assert.equal(parsed.note, "Uses 行く for movement toward a destination.");
});

test("parseSentenceAnkiBack returns null for invalid JSON", () => {
  assert.equal(parseSentenceAnkiBack("not json"), null);
});
