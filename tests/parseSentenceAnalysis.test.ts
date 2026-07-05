import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSentenceAnalysis } from "../renderer/utils/parseSentenceAnalysis";

test("parseSentenceAnalysis parses fenced JSON", () => {
  const raw = `\`\`\`json
{
  "summary": "A polite greeting.",
  "translation": "Hello.",
  "grammar": [{ "pattern": "です", "explanation": "Polite copula." }],
  "vocabulary": [{ "word": "こんにちは", "reading": "konnichiwa", "meaning": "hello" }],
  "culturalNotes": [],
  "learningTips": ["Use with acquaintances."]
}
\`\`\``;

  const parsed = parseSentenceAnalysis(raw);
  assert.ok(parsed);
  assert.equal(parsed.summary, "A polite greeting.");
  assert.equal(parsed.translation, "Hello.");
  assert.equal(parsed.grammar.length, 1);
  assert.equal(parsed.vocabulary[0].word, "こんにちは");
  assert.equal(parsed.learningTips[0], "Use with acquaintances.");
});

test("parseSentenceAnalysis returns null for invalid JSON", () => {
  assert.equal(parseSentenceAnalysis("not json"), null);
});
