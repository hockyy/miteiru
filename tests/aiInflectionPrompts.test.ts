import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildInflectionExampleMeaning,
  flattenInflectionRows,
  indexInflectionExamples,
  parseInflectionExamplesResponse,
} from "../renderer/utils/aiInflectionPrompts";

test("flattenInflectionRows expands each surface form", () => {
  const forms = flattenInflectionRows([
    {
      id: "te",
      label: "Te-form",
      forms: ["食べて", "食べて"],
      useHint: "Link actions.",
      essential: true,
    },
  ]);

  assert.equal(forms.length, 2);
  assert.equal(forms[0]?.form, "食べて");
});

test("buildInflectionExampleMeaning includes gloss and label", () => {
  assert.equal(
    buildInflectionExampleMeaning("Te-form", "食べて", "I eat and go home.", "to eat"),
    "Te-form · 食べて — to eat: I eat and go home.",
  );
});

test("indexInflectionExamples maps examples by label and form", () => {
  const map = indexInflectionExamples([
    {
      sentence: "ごはんを食べてから出かけます。",
      meaning: "Te-form · 食べて — to eat: I go out after eating.",
    },
  ]);

  assert.ok(map.get("Te-form::食べて"));
});

test("parseInflectionExamplesResponse maps AI JSON into user note examples", () => {
  const forms = [
    { form: "食べて", label: "Te-form", useHint: "Link actions." },
    { form: "食べます", label: "Polite (masu)", useHint: "Polite speech." },
  ];

  const parsed = parseInflectionExamplesResponse(
    JSON.stringify({
      examples: [
        {
          form: "食べて",
          label: "Te-form",
          sentence: "ごはんを食べてから出かけます。",
          meaning: "I go out after eating.",
        },
        {
          form: "食べます",
          label: "Polite (masu)",
          sentence: "毎朝、パンを食べます。",
          meaning: "I eat bread every morning.",
        },
      ],
    }),
    forms,
    "to eat",
  );

  assert.equal(parsed.length, 2);
  assert.equal(parsed[0]?.sentence, "ごはんを食べてから出かけます。");
  assert.match(parsed[0]?.meaning ?? "", /^Te-form · 食べて — to eat:/);
});
