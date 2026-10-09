import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTranslationSystemPrompt,
  getTranslationLoadingSubMessage,
  normalizeTranslationDetailOptions,
} from "../renderer/utils/aiTranslationPrompts";

test("translation prompt includes learner notes by default", () => {
  const prompt = buildTranslationSystemPrompt("ja");
  assert.match(prompt, /"grammar":/);
  assert.match(prompt, /"glossary":/);
  assert.match(prompt, /"chunks":/);
  assert.match(prompt, /Include 2-4 grammar notes/);
  assert.match(prompt, /Include 4-10 glossary entries/);
  assert.match(prompt, /Include brief chunk notes/);
});

test("translation prompt omits notes that are turned off", () => {
  const prompt = buildTranslationSystemPrompt("ja", {
    grammar: false,
    glossary: false,
    wordingNotes: false,
  });
  assert.doesNotMatch(prompt, /"grammar":/);
  assert.doesNotMatch(prompt, /"glossary":/);
  assert.doesNotMatch(prompt, /"chunks":/);
  assert.doesNotMatch(prompt, /Do not include/);
  assert.match(prompt, /"formal":/);
  assert.match(prompt, /"casual":/);
});

test("unchecked styles and notes stay out of the schema", () => {
  const full = buildTranslationSystemPrompt("ja");
  const slim = buildTranslationSystemPrompt("ja", {
    formal: false,
    neutral: true,
    casual: false,
    grammar: false,
    glossary: false,
    wordingNotes: true,
  });

  assert.ok(slim.length < full.length);
  assert.match(slim, /"neutral":/);
  assert.match(slim, /"register": "neutral"/);
  assert.doesNotMatch(slim, /"formal":/);
  assert.doesNotMatch(slim, /"casual":/);
  assert.doesNotMatch(slim, /"register": "formal"/);
  assert.doesNotMatch(slim, /"register": "casual"/);
  assert.doesNotMatch(slim, /"grammar":/);
  assert.doesNotMatch(slim, /"glossary":/);
  assert.doesNotMatch(slim, /all three variants/);
});

test("translation prompt can keep a single note section", () => {
  const prompt = buildTranslationSystemPrompt("zh-CN", {
    grammar: false,
    glossary: true,
    wordingNotes: false,
  });
  assert.match(prompt, /"glossary":/);
  assert.doesNotMatch(prompt, /"grammar":/);
  assert.doesNotMatch(prompt, /"chunks":/);
  assert.match(prompt, /Simplified Chinese/);
});

test("normalizeTranslationDetailOptions fills missing flags", () => {
  assert.deepEqual(normalizeTranslationDetailOptions({ glossary: false }), {
    formal: true,
    neutral: true,
    casual: true,
    grammar: true,
    glossary: false,
    wordingNotes: true,
  });
  assert.equal(normalizeTranslationDetailOptions({
    formal: false,
    neutral: false,
    casual: false,
  }).neutral, true);
});

test("loading message names only the sections that will be generated", () => {
  assert.equal(
    getTranslationLoadingSubMessage({ grammar: false, glossary: false, wordingNotes: false }),
    "Formal, neutral, and casual translations on the way",
  );
  assert.match(
    getTranslationLoadingSubMessage({ grammar: true, glossary: false, wordingNotes: true }),
    /grammar notes, wording notes/,
  );
  assert.equal(
    getTranslationLoadingSubMessage({
      formal: false,
      neutral: false,
      casual: true,
      grammar: false,
      glossary: false,
      wordingNotes: false,
    }),
    "Casual translation on the way",
  );
});
