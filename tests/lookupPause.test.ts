import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {lookupPauseStep} from "../renderer/utils/lookupPause";

const base = {open: false, wasOpen: false, playing: true, enabled: true, pausedByUs: false};

describe("lookupPauseStep", () => {
  it("pauses a playing video when the popup opens", () => {
    assert.deepEqual(lookupPauseStep({...base, open: true}), {pause: true, resume: false, pausedByUs: true});
  });

  it("resumes when the popup closes after Miteiru paused the video", () => {
    assert.deepEqual(
        lookupPauseStep({...base, open: false, wasOpen: true, playing: false, pausedByUs: true}),
        {pause: false, resume: true, pausedByUs: false});
  });

  it("leaves a video the learner had paused alone, both ways", () => {
    const opened = lookupPauseStep({...base, open: true, playing: false});
    assert.deepEqual(opened, {pause: false, resume: false, pausedByUs: false});
    const closed = lookupPauseStep({...base, open: false, wasOpen: true, playing: false, pausedByUs: opened.pausedByUs});
    assert.equal(closed.resume, false);
  });

  it("does nothing when the setting is off", () => {
    const opened = lookupPauseStep({...base, open: true, enabled: false});
    assert.deepEqual(opened, {pause: false, resume: false, pausedByUs: false});
  });

  it("does not resume a video the learner started again by hand while the popup was open", () => {
    const stillOpen = lookupPauseStep({...base, open: true, wasOpen: true, playing: true, pausedByUs: true});
    assert.equal(stillOpen.pausedByUs, false);
    assert.equal(lookupPauseStep({...base, open: false, wasOpen: true, pausedByUs: stillOpen.pausedByUs}).resume, false);
  });

  it("keeps the memory while the popup stays open and the video stays paused", () => {
    const step = lookupPauseStep({...base, open: true, wasOpen: true, playing: false, pausedByUs: true});
    assert.deepEqual(step, {pause: false, resume: false, pausedByUs: true});
  });

  it("does nothing while closed", () => {
    assert.deepEqual(lookupPauseStep(base), {pause: false, resume: false, pausedByUs: false});
  });
});
