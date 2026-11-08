import assert from "node:assert/strict";
import {test} from "node:test";
import {filterVocab, isFiltering, NO_VOCAB_FILTER} from "../renderer/components/VideoPlayer/vocabFilter";

const entries = [
  ["犬", {level: 0}],
  ["猫", {level: 1}],
  ["食べる", {level: 2}],
  ["Abc", {level: 3}],
  ["犬小屋", {level: 1}],
] as const;
const notes: Record<string, string> = {"犬": "dog", "猫": "cat"};
const run = (query: string, level: number | "notes" | null = null) =>
  filterVocab(entries, {query, level}, (word) => notes[word], (word) => word in notes).map(([word]) => word);

test("no filter keeps every word, as the same list", () => {
  assert.equal(filterVocab(entries, NO_VOCAB_FILTER, () => undefined, () => false), entries);
  assert.equal(isFiltering(NO_VOCAB_FILTER), false);
  assert.equal(isFiltering({query: "  ", level: null}), false);
});

test("the query matches part of a word, keeping the list's order", () => {
  assert.deepEqual(run("犬"), ["犬", "犬小屋"]);
  assert.deepEqual(run("食べ"), ["食べる"]);
});

test("the query ignores case and full-width letters", () => {
  assert.deepEqual(run("abc"), ["Abc"]);
  assert.deepEqual(run("ＡＢＣ"), ["Abc"]);
});

test("the query also matches an AI note's meaning", () => {
  assert.deepEqual(run("dog"), ["犬"]);
  assert.deepEqual(run("CAT"), ["猫"]);
});

test("a level chip keeps that level, and the notes chip words with notes", () => {
  assert.deepEqual(run("", 1), ["猫", "犬小屋"]);
  assert.deepEqual(run("", 0), ["犬"]);
  assert.deepEqual(run("", "notes"), ["犬", "猫"]);
});

test("a level and a query together", () => {
  assert.deepEqual(run("犬", 1), ["犬小屋"]);
  assert.deepEqual(run("zzz", 1), []);
});
