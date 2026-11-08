import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
  clampWindow,
  closestIndexByTime,
  growWindow,
  windowAround,
} from "../renderer/components/VideoPlayer/vocabWindow";

describe("windowAround", () => {
  it("centres the window on the anchor", () => {
    assert.deepEqual(windowAround(1000, 500, 120), {start: 440, end: 560});
  });

  it("stays inside the list at either end", () => {
    assert.deepEqual(windowAround(1000, 10, 120), {start: 0, end: 120});
    assert.deepEqual(windowAround(1000, 995, 120), {start: 880, end: 1000});
  });

  it("covers a list shorter than the window", () => {
    assert.deepEqual(windowAround(50, 30, 120), {start: 0, end: 50});
  });

  it("starts at the top for no anchor (-1) and at the end for a broken one", () => {
    assert.deepEqual(windowAround(1000, -1, 120), {start: 0, end: 120});
    assert.deepEqual(windowAround(1000, Number.NaN, 120), {start: 880, end: 1000});
  });

  it("is empty for an empty list", () => {
    assert.deepEqual(windowAround(0, 0), {start: 0, end: 0});
  });
});

describe("clampWindow", () => {
  it("leaves a window that fits alone", () => {
    assert.deepEqual(clampWindow({start: 10, end: 130}, 1000), {start: 10, end: 130});
  });

  it("cuts a window to a list that got shorter", () => {
    assert.deepEqual(clampWindow({start: 10, end: 130}, 100), {start: 10, end: 100});
  });

  it("moves a window the list shrank past to the list's end", () => {
    assert.deepEqual(clampWindow({start: 500, end: 620}, 300), windowAround(300, 299));
  });
});

describe("growWindow", () => {
  it("adds a step above or below", () => {
    assert.deepEqual(growWindow({start: 440, end: 560}, 1000, "up", 120, 480), {start: 320, end: 560});
    assert.deepEqual(growWindow({start: 440, end: 560}, 1000, "down", 120, 480), {start: 440, end: 680});
  });

  it("stops at the list's ends", () => {
    assert.deepEqual(growWindow({start: 50, end: 170}, 1000, "up", 120, 480), {start: 0, end: 170});
    assert.deepEqual(growWindow({start: 900, end: 950}, 1000, "down", 120, 480), {start: 900, end: 1000});
  });

  it("drops entries from the far end past the most it may hold", () => {
    assert.deepEqual(growWindow({start: 400, end: 880}, 2000, "down", 120, 480), {start: 520, end: 1000});
    assert.deepEqual(growWindow({start: 400, end: 880}, 2000, "up", 120, 480), {start: 280, end: 760});
  });

  it("keeps the entries next to the growing edge, so one of them can hold the scroll position", () => {
    const before = {start: 400, end: 880};
    const down = growWindow(before, 2000, "down", 120, 480);
    assert.ok(down.start <= before.end - 1 && before.end - 1 < down.end);
    const up = growWindow(before, 2000, "up", 120, 480);
    assert.ok(up.start <= before.start && before.start < up.end);
  });

  it("first fits a window to a list that changed", () => {
    assert.deepEqual(growWindow({start: 500, end: 620}, 560, "down", 120, 480), {start: 500, end: 560});
  });
});

describe("closestIndexByTime", () => {
  const entry = (updTime: number) => ["word", {updTime}] as const;

  it("finds the entry nearest to now, before or after it", () => {
    assert.equal(closestIndexByTime([entry(10), entry(40), entry(100)], 55), 1);
    assert.equal(closestIndexByTime([entry(10), entry(40), entry(100)], 80), 2);
  });

  it("takes the first of equally near entries", () => {
    assert.equal(closestIndexByTime([entry(40), entry(60)], 50), 0);
  });

  it("skips entries without a time, and gives -1 when none has one", () => {
    assert.equal(closestIndexByTime([entry(Number.NaN), entry(40)], 0), 1);
    assert.equal(closestIndexByTime([entry(Number.NaN)], 0), -1);
    assert.equal(closestIndexByTime([], 0), -1);
  });
});
