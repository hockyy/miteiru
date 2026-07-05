import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAiTranslation, formatVariantForCopy } from "../renderer/utils/parseAiTranslation";

test("parseAiTranslation parses sentence translations", () => {
  const raw = `{
    "sentences": [{
      "source": "Hello",
      "formal": { "text": "こんにちは", "pronunciation": "konnichiwa" },
      "neutral": { "text": "やあ", "pronunciation": "yaa" },
      "casual": { "text": "よ", "pronunciation": "yo" },
      "grammar": [{ "pattern": "よ", "explanation": "Casual sentence-final particle." }],
      "glossary": [],
      "chunks": []
    }]
  }`;

  const parsed = parseAiTranslation(raw);
  assert.ok(parsed);
  assert.equal(parsed.sentences.length, 1);
  assert.equal(parsed.sentences[0].neutral.text, "やあ");
  assert.equal(parsed.sentences[0].grammar[0].pattern, "よ");
  assert.equal(parsed.sentences[0].grammar[0].explanation, "Casual sentence-final particle.");
});

test("formatVariantForCopy includes pronunciation", () => {
  const formatted = formatVariantForCopy({ text: "こんにちは", pronunciation: "konnichiwa" });
  assert.match(formatted, /こんにちは/);
  assert.match(formatted, /konnichiwa/);
});
