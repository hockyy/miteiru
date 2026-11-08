import assert from "node:assert/strict";
import {afterEach, describe, it} from "node:test";
import {
  announceLearningStateChanged,
  LEARNING_STATE_CHANGED_EVENT,
} from "../renderer/utils/learningStateEvents";

describe("announceLearningStateChanged", () => {
  const original = (globalThis as {window?: unknown}).window;
  afterEach(() => {
    (globalThis as {window?: unknown}).window = original;
  });

  it("tells a listener on window which language changed", () => {
    (globalThis as {window?: unknown}).window = new EventTarget();
    const heard: string[] = [];
    window.addEventListener(LEARNING_STATE_CHANGED_EVENT, (event) => {
      heard.push((event as CustomEvent<{lang: string}>).detail.lang);
    });
    announceLearningStateChanged("ja");
    assert.deepEqual(heard, ["ja"]);
  });
});
