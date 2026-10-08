import assert from "node:assert/strict";
import {beforeEach, test} from "node:test";
import Vietnamese from "../main/handler/vietnamese";

beforeEach(() => {
  Vietnamese.dictionary = new Map([
    ["Nga", "Russia(n)"],
    ["nga", "Russia"],
    ["rồi", "already"],
    ["Việt Nam", "Vietnam"],
    ["tôi", "I"],
    ["yêu", "to love"],
    ["nước", "country"],
    ["nước Nga", "Russia"],
    ["hôm nay", "today"],
  ]);
});

const summarize = (sentence: string) => Vietnamese.tokenizeLongestSuffix(sentence).map((token) => [
  token.origin,
  token.separation.map((part) => part.main).join(" "),
  token.meaning,
]);

test("tokenizeLongestSuffix matches syllables with punctuation attached", () => {
  assert.deepEqual(summarize("Nga, rồi."), [
    ["Nga", "Nga,", "Russia(n)"],
    ["rồi", "rồi.", "already"],
  ]);
});

test("tokenizeLongestSuffix falls back to the lowercase dictionary entry", () => {
  assert.deepEqual(summarize("Tôi yêu Việt Nam!"), [
    ["tôi", "Tôi", "I"],
    ["yêu", "yêu", "to love"],
    ["Việt Nam", "Việt Nam!", "Vietnam"],
  ]);
  assert.deepEqual(summarize("Hôm nay"), [["hôm nay", "Hôm nay", "today"]]);
  assert.deepEqual(summarize("Nước Nga, rồi."), [
    ["nước Nga", "Nước Nga,", "Russia"],
    ["rồi", "rồi.", "already"],
  ]);
});

test("tokenizeLongestSuffix does not join syllables across punctuation", () => {
  assert.deepEqual(summarize("nước, Nga"), [
    ["nước", "nước,", "country"],
    ["Nga", "Nga", "Russia(n)"],
  ]);
  assert.deepEqual(summarize("nước Nga"), [["nước Nga", "nước Nga", "Russia"]]);
});

test("tokenizeLongestSuffix keeps unknown words and bare punctuation as their own tokens", () => {
  assert.deepEqual(summarize("- Xin  chào..."), [
    ["-", "-", ""],
    ["Xin", "Xin", ""],
    ["chào", "chào...", ""],
  ]);
});
