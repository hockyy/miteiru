import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {adjustTimeWithShift} from "../renderer/utils/utils";
import {describeSubtitleShift, SHIFT_STEP_MS, shiftStepLabel, subtitleShiftToast} from "../renderer/utils/subtitleTiming";
import {buildShortcutGroups} from "../renderer/utils/shortcuts";
import {keyCommandDefinitions} from "../renderer/utils/keyCommands";

describe("subtitle timing words", () => {
  it("a positive shift makes lines appear later, by the math the player uses", () => {
    // A line that starts at 1000 ms is looked up at `video time - shift`: with +100 ms it is found
    // only once the video reaches 1100 ms, so it shows later.
    const startMs = 1000;
    const shiftMs = 100;
    assert.ok(adjustTimeWithShift(1.05, shiftMs) < startMs, "at 1.05 s the shifted line has not started yet");
    assert.ok(adjustTimeWithShift(1.1, shiftMs) >= startMs, "it starts at 1.1 s");
    assert.equal(describeSubtitleShift(shiftMs), "0.1 s later");
    // A negative shift is the opposite: the line is already due at 0.95 s.
    assert.ok(adjustTimeWithShift(0.95, -100) >= startMs);
    assert.equal(describeSubtitleShift(-100), "0.1 s earlier");
  });

  it("says on time at zero and keeps one decimal for 0.1 s steps", () => {
    assert.equal(describeSubtitleShift(0), "on time");
    assert.equal(describeSubtitleShift(300), "0.3 s later");
    assert.equal(describeSubtitleShift(-1200), "1.2 s earlier");
    assert.equal(describeSubtitleShift(1000), "1.0 s later");
    assert.equal(describeSubtitleShift(250), "0.25 s later");
  });

  it("names the subtitle in the toast", () => {
    assert.equal(subtitleShiftToast("Japanese subtitles", 300), "Japanese subtitles now 0.3 s later");
    assert.equal(subtitleShiftToast("Translation", -200), "Translation now 0.2 s earlier");
    assert.equal(subtitleShiftToast("Japanese subtitles", 0), "Japanese subtitles back on time");
  });

  it("labels the step buttons with a real minus sign", () => {
    assert.equal(SHIFT_STEP_MS, 100);
    assert.equal(shiftStepLabel(-1), "\u22120.1 s");
    assert.equal(shiftStepLabel(1), "+0.1 s");
  });

  it("the shortcut sheet agrees: [ is earlier and ] is later", () => {
    const items = buildShortcutGroups(keyCommandDefinitions("Japanese"), {languageName: "Japanese", mac: false})
      .flatMap((group) => group.items);
    assert.match(items.find((item) => item.keys === "[")?.description ?? "", /Japanese subtitles 0\.1 s earlier/);
    assert.match(items.find((item) => item.keys === "]")?.description ?? "", /Japanese subtitles 0\.1 s later/);
    assert.match(items.find((item) => item.keys === "Ctrl + [")?.description ?? "", /translation 0\.1 s earlier/);
    assert.match(items.find((item) => item.keys === "Ctrl + ]")?.description ?? "", /translation 0\.1 s later/);
  });
});
