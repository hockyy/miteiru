import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {seekSeconds} from "../renderer/utils/playbackClock";

describe("seekSeconds", () => {
  it("never goes below 0, since mpv counts a negative absolute seek from the end", () => {
    assert.equal(seekSeconds(-3), 0);
    assert.equal(seekSeconds(-0.5), 0);
  });

  it("keeps a normal time", () => {
    assert.equal(seekSeconds(0), 0);
    assert.equal(seekSeconds(12.5), 12.5);
  });

  it("turns a time that is not a number into 0", () => {
    assert.equal(seekSeconds(NaN), 0);
    assert.equal(seekSeconds(-Infinity), 0);
  });
});
