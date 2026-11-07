import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {isTopDialog, nextTabIndex, registerDialog} from "../renderer/utils/dialogFocus";

describe("nextTabIndex", () => {
  it("does nothing without controls", () => {
    assert.equal(nextTabIndex(0, -1, false), null);
  });
  it("enters at the first control forwards and the last backwards", () => {
    assert.equal(nextTabIndex(3, -1, false), 0);
    assert.equal(nextTabIndex(3, -1, true), 2);
  });
  it("wraps at both ends and lets the browser move in between", () => {
    assert.equal(nextTabIndex(3, 2, false), 0);
    assert.equal(nextTabIndex(3, 0, true), 2);
    assert.equal(nextTabIndex(3, 1, false), null);
    assert.equal(nextTabIndex(3, 1, true), null);
  });
});

describe("dialog stack", () => {
  it("lets only the newest dialog answer Esc", () => {
    const a = Symbol("a");
    const b = Symbol("b");
    const offA = registerDialog(a);
    const offB = registerDialog(b);
    assert.equal(isTopDialog(a), false);
    assert.equal(isTopDialog(b), true);
    offB();
    assert.equal(isTopDialog(a), true);
    offA();
  });
});
