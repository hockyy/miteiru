import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {rightClickSaveMessage} from "../renderer/utils/vocabSaveLevels";

describe("rightClickSaveMessage", () => {
  it("names the level the word moved to and what the next right-click does", () => {
    assert.equal(rightClickSaveMessage("天気", 1), "Saved 天気 as Learning. Right-click again: Known.");
    assert.equal(rightClickSaveMessage("天気", 2), "天気 is Known now. Right-click again: back to New.");
    assert.equal(rightClickSaveMessage("天気", 0), "天気 is New again. Right-click again: Learning.");
  });
});
