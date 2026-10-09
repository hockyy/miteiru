import assert from "node:assert/strict";
import {test} from "node:test";
import {fitScale} from "../renderer/components/Subtitle/ScrollingLyrics";

test("fitScale leaves content that fits alone", () => {
  assert.equal(fitScale(500, 828), 1);
  assert.equal(fitScale(828, 828), 1);
});

test("fitScale shrinks content that is too tall to the available height", () => {
  assert.equal(fitScale(800, 400), 0.5);
  assert.ok(Math.abs(fitScale(600, 552) - 0.92) < 1e-9);
  assert.ok(fitScale(600, 552) < 1);
});

test("fitScale never goes below the minimum", () => {
  assert.equal(fitScale(1000, 100), 0.5);
  assert.equal(fitScale(1000, 100, 0.25), 0.25);
  assert.equal(fitScale(1000, 400, 0.25), 0.4);
});

test("fitScale falls back to the minimum when there is no room at all", () => {
  assert.equal(fitScale(500, 0), 0.5);
  assert.equal(fitScale(500, -40), 0.5);
});

test("fitScale has nothing to scale when the content is empty", () => {
  assert.equal(fitScale(0, 0), 1);
  assert.equal(fitScale(0, -10), 1);
});
