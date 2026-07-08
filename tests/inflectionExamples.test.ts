import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildInflectionExampleMeaning,
  buildInflectionExamples,
  mergeInflectionExamples,
} from "../renderer/utils/inflectionExamples";

test("buildInflectionExamples creates one example per surface form with dictionary gloss", () => {
  const examples = buildInflectionExamples(
    [
      {
        id: "te",
        label: "Te-form",
        forms: ["食べて"],
        useHint: "Link actions.",
        essential: true,
      },
      {
        id: "plain",
        label: "Plain / polite",
        forms: ["静かだ", "静かです"],
        useHint: "Predicate form.",
        essential: true,
      },
    ],
    {
      kind: "na-adjective",
      dictionaryForm: "静か",
      clickedForm: "静か",
      isInflected: false,
      rows: [],
      ladder: [],
    },
    "quiet",
  );

  assert.equal(examples.length, 3);
  assert.equal(examples[0]?.sentence, "食べてから、家に帰ります。");
  assert.equal(examples[0]?.label, "Te-form · 食べて");
  assert.match(examples[0]?.meaning ?? "", /^quiet — Te-form:/);
  assert.equal(examples[1]?.sentence, "ここは静かだ。");
  assert.match(examples[1]?.meaning ?? "", /^quiet — Plain \/ polite:/);
});

test("buildInflectionExampleMeaning falls back to form note without gloss", () => {
  assert.equal(
    buildInflectionExampleMeaning(
      {
        id: "past",
        label: "Past (ta)",
        forms: ["食べた"],
        useHint: "Completed actions.",
        essential: true,
      },
      "",
    ),
    "Past (ta): Completed actions.",
  );
});

test("mergeInflectionExamples appends only new sentences", () => {
  const merged = mergeInflectionExamples(
    [{ sentence: "昨日、食べた。", meaning: "Past" }],
    [
      { sentence: "昨日、食べた。", meaning: "Duplicate" },
      { sentence: "毎朝、食べます。", meaning: "Polite" },
    ],
  );

  assert.equal(merged.length, 2);
  assert.equal(merged[1]?.sentence, "毎朝、食べます。");
});
