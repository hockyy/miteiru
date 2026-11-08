import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createPartialHandler,
  createThrottledEmitter,
  partialJsonObjectText,
} from "../renderer/utils/aiStreaming";
import { normalizePartialSentenceAnalysis } from "../renderer/utils/parseSentenceAnalysis";
import {
  normalizePartialAiTranslation,
  parseAiTranslation,
} from "../renderer/utils/parseAiTranslation";
import { parseSentenceAnalysis } from "../renderer/utils/parseSentenceAnalysis";
import type { SentenceAnalysis } from "../renderer/types/sentenceAnalysis";

const analysisJson = JSON.stringify({
  summary: "A polite greeting.",
  translation: "Good morning.",
  grammar: [{ pattern: "ございます", explanation: "Polite copula." }],
  vocabulary: [{ word: "おはよう", reading: "ohayou", meaning: "morning" }],
  culturalNotes: ["Used until about 10am."],
  learningTips: ["Drop ございます with friends."],
});
const fenced = "```json\n" + analysisJson + "\n```";

function chunksOf(text: string, size: number) {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test("throttle emits at most once per interval and always the final text", () => {
  let clock = 0;
  const seen: string[] = [];
  const emitter = createThrottledEmitter((t) => seen.push(t), 60, () => clock);
  emitter.push("a"); // first goes out at once
  clock = 20; emitter.push("ab");
  clock = 40; emitter.push("abc");
  clock = 70; emitter.push("abcd");
  clock = 80; emitter.push("abcde");
  emitter.flush("abcdef");
  assert.deepEqual(seen, ["a", "abcd", "abcdef"]);
});

test("throttle: a stalled stream still shows its latest text", async () => {
  const seen: string[] = [];
  const emitter = createThrottledEmitter((t) => seen.push(t), 20);
  emitter.push("one");
  emitter.push("one two");
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(seen, ["one", "one two"]);
});

test("throttle: cancel drops the pending update of a failed or cancelled stream", async () => {
  const seen: string[] = [];
  const emitter = createThrottledEmitter((t) => seen.push(t), 20);
  emitter.push("one");
  emitter.push("one two");
  emitter.cancel();
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(seen, ["one"]);
});

test("partialJsonObjectText skips prose and fences", () => {
  assert.equal(partialJsonObjectText("no json"), null);
  assert.equal(partialJsonObjectText('Sure!\n```json\n{"a": 1'), '{"a": 1');
  assert.equal(partialJsonObjectText('{"a":1}\n```'), '{"a":1}');
});

test("streamed analysis grows into the complete result", async () => {
  const partials: SentenceAnalysis[] = [];
  const handler = createPartialHandler(normalizePartialSentenceAnalysis, (v) => partials.push(v), () => false);
  let text = "";
  for (const chunk of chunksOf(fenced, 7)) {
    text += chunk;
    handler(text);
    await flush();
  }
  assert.ok(partials.length > 3);
  // nothing before the summary starts
  assert.ok(partials.every((p) => p.summary || p.translation));
  // sections only ever appear, never shrink
  for (let i = 1; i < partials.length; i++) {
    assert.ok(partials[i].summary.length >= partials[i - 1].summary.length);
    assert.ok(partials[i].grammar.length >= partials[i - 1].grammar.length);
    assert.ok(partials[i].vocabulary.length >= partials[i - 1].vocabulary.length);
  }
  assert.ok(partials.some((p) => p.summary && !p.translation));
  assert.ok(partials.some((p) => p.grammar.length === 0 && p.translation));
  assert.deepEqual(partials[partials.length - 1], parseSentenceAnalysis(fenced));
});

test("stale or out-of-order parses are dropped", async () => {
  const seen: string[] = [];
  let stale = false;
  const slowFirst = (jsonText: string) =>
    new Promise<{ value: unknown }>((resolve) =>
      setTimeout(() => resolve({ value: { summary: jsonText } }), jsonText.length > 10 ? 0 : 20));
  const handler = createPartialHandler(
    normalizePartialSentenceAnalysis,
    (v) => seen.push(v.summary),
    () => stale,
    slowFirst,
  );
  handler('{"s":1}');
  handler('{"summary": "longer text"}');
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.deepEqual(seen, ['{"summary": "longer text"}']);
  stale = true;
  handler('{"summary": "after abort"}');
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(seen.length, 1);
});

test("partial analysis needs a summary or translation and never has undefined fields", () => {
  assert.equal(normalizePartialSentenceAnalysis(undefined), null);
  assert.equal(normalizePartialSentenceAnalysis({}), null);
  assert.equal(normalizePartialSentenceAnalysis({ summary: "" }), null);
  assert.equal(normalizePartialSentenceAnalysis({ grammar: [{ pattern: "x" }] }), null);
  assert.equal(normalizePartialSentenceAnalysis([1]), null);
  const partial = normalizePartialSentenceAnalysis({
    summary: "Hel",
    grammar: [null, { pattern: "は" }, 5],
    vocabulary: [{ word: "猫" }],
    culturalNotes: [null, "ok"],
    learningTips: "oops",
  });
  assert.deepEqual(partial, {
    summary: "Hel",
    translation: "",
    grammar: [{ pattern: "は", explanation: "" }],
    vocabulary: [{ word: "猫", meaning: "" }],
    culturalNotes: ["ok"],
    learningTips: [],
  });
});

const translationJson = JSON.stringify({
  sentences: [
    {
      source: "Hello",
      formal: { text: "こんにちは", pronunciation: "konnichiwa" },
      neutral: { text: "やあ", pronunciation: "yaa" },
      casual: { text: "よ", pronunciation: "yo" },
      grammar: [{ pattern: "よ", explanation: "Particle." }],
      glossary: [],
      chunks: [],
    },
    {
      source: "Bye",
      formal: { text: "さようなら", pronunciation: "sayounara" },
      neutral: { text: "じゃあね", pronunciation: "jaane" },
      casual: { text: "またね", pronunciation: "matane" },
      grammar: [],
      glossary: [],
      chunks: [],
    },
  ],
});

test("streamed translation shows sentences once they have a translation line", async () => {
  const partials: number[] = [];
  let last: unknown = null;
  const handler = createPartialHandler(
    normalizePartialAiTranslation,
    (v) => { partials.push(v.sentences.length); last = v; },
    () => false,
  );
  let text = "";
  for (const chunk of chunksOf(translationJson, 11)) {
    text += chunk;
    handler(text);
    await flush();
  }
  assert.ok(partials.length > 2);
  assert.equal(partials[0], 1);
  assert.equal(Math.max(...partials), 2);
  assert.deepEqual(last, parseAiTranslation(translationJson));
});

test("partial translation ignores sentences with only a source", () => {
  assert.equal(normalizePartialAiTranslation({ sentences: [{ source: "Hello" }] }), null);
  assert.equal(normalizePartialAiTranslation({ sentences: "x" }), null);
  assert.equal(normalizePartialAiTranslation(null), null);
  const partial = normalizePartialAiTranslation({
    sentences: [{ source: "Hi", formal: { text: "やあ" } }, { source: "next" }],
  });
  assert.equal(partial?.sentences.length, 1);
  assert.equal(partial?.sentences[0].formal.text, "やあ");
  assert.equal(partial?.sentences[0].casual.text, "");
  assert.deepEqual(partial?.sentences[0].grammar, []);
});