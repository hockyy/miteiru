import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {firstVisibleIndex} from "../renderer/components/VideoPlayer/vocabScroll";

// Ten cards, 40 px tall: card i spans [i * 40, i * 40 + 40).
const bottomOf = (index: number) => index * 40 + 40;

describe("firstVisibleIndex", () => {
  it("is 0 for an empty list", () => {
    assert.equal(firstVisibleIndex(0, bottomOf, 100), 0);
  });

  it("is the count when every card is above the view", () => {
    assert.equal(firstVisibleIndex(10, bottomOf, 400), 10);
    assert.equal(firstVisibleIndex(10, bottomOf, 1000), 10);
  });

  it("is 0 when every card is below the view", () => {
    assert.equal(firstVisibleIndex(10, bottomOf, -50), 0);
    assert.equal(firstVisibleIndex(10, bottomOf, 0), 0);
  });

  it("finds the card across the top edge", () => {
    assert.equal(firstVisibleIndex(10, bottomOf, 100), 2);
  });

  it("counts a card whose bottom is exactly at the top edge as above", () => {
    assert.equal(firstVisibleIndex(10, bottomOf, 80), 2);
    assert.equal(firstVisibleIndex(10, bottomOf, 79), 1);
    assert.equal(firstVisibleIndex(10, bottomOf, 81), 2);
  });

  it("measures only a few cards", () => {
    let calls = 0;
    firstVisibleIndex(30000, (i) => { calls += 1; return i * 40 + 40; }, 600000);
    assert.ok(calls <= 16);
  });
});
