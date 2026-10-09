import assert from "node:assert/strict";
import {test} from "node:test";
import {PlaybackClock} from "../renderer/utils/playbackClock";
import {findLastLineStartingBy, findLineIndexAt, getLyricsWindow, Line} from "../renderer/components/Subtitle/DataStructures";

test("PlaybackClock notifies only when the time moves", () => {
  const clock = new PlaybackClock();
  const seen: number[] = [];
  const unsubscribe = clock.subscribe(() => seen.push(clock.get()));

  clock.set(1.5);
  clock.set(1.5);
  clock.set(Number.NaN);
  clock.set(2);
  assert.deepEqual(seen, [1.5, 2]);
  assert.equal(clock.get(), 2);

  unsubscribe();
  clock.set(3);
  assert.deepEqual(seen, [1.5, 2]);
});

// Lines as SubtitleContainer builds them: in start order, not overlapping.
const lines = [[1000, 2000], [3000, 4000], [5000, 6000], [7000, 8000], [9000, 10000]]
.map(([start, end], index) => new Line(start, end, `line ${index}`));

test("findLineIndexAt finds the shown line and nothing between lines", () => {
  assert.equal(findLineIndexAt(lines, 500), -1);
  assert.equal(findLineIndexAt(lines, 1000), 0);
  assert.equal(findLineIndexAt(lines, 2000), 0);
  assert.equal(findLineIndexAt(lines, 2500), -1);
  assert.equal(findLineIndexAt(lines, 9999), 4);
  assert.equal(findLineIndexAt(lines, 20000), -1);
  assert.equal(findLineIndexAt([], 1000), -1);
  assert.equal(findLineIndexAt(undefined, 1000), -1);
  assert.equal(findLastLineStartingBy(lines, 2500), 0);
  assert.equal(findLastLineStartingBy(lines, 20000), 4);
});

test("getLyricsWindow keeps the current line at its position and leads up to the next one", () => {
  // Current line 2 shown second of three.
  assert.deepEqual(getLyricsWindow(lines, 5500, 3, 1), {start: 1, current: 1});
  // First line cannot have a line above it.
  assert.deepEqual(getLyricsWindow(lines, 1500, 3, 1), {start: 0, current: 0});
  // Between lines 1 and 2: line 2 waits in the current position, nothing highlighted.
  assert.deepEqual(getLyricsWindow(lines, 4500, 3, 1), {start: 1, current: -1});
  // Before everything and after everything.
  assert.deepEqual(getLyricsWindow(lines, 0, 3, 1), {start: 0, current: -1});
  assert.deepEqual(getLyricsWindow(lines, 50000, 3, 1), {start: 2, current: -1});
  assert.deepEqual(getLyricsWindow([], 1000, 3, 1), {start: 0, current: -1});
});

test("auto-pause stops once in the last frames of a line and re-arms on the next line", async () => {
  const {autoPauseStep} = await import("../renderer/hooks/usePauseAndRepeat");
  const line = [1000, 2000];
  let pauseId = -1;
  const run = (time: number, cache = line, enabled = true) => {
    const step = autoPauseStep(cache, time, enabled, pauseId);
    pauseId = step.pauseId;
    return step.pause;
  };
  assert.equal(run(1200), false);
  assert.equal(run(1980), true);
  // Still in the pause period (e.g. the user pressed play again): no second pause.
  assert.equal(run(1990), false);
  // Next line arms again.
  assert.equal(run(3100, [3000, 4000]), false);
  assert.equal(run(3990, [3000, 4000]), true);
  // Disabled: never pauses; between lines: nothing to pause at.
  pauseId = -1;
  assert.equal(run(1200, line, false), false);
  assert.equal(run(1990, line, false), false);
  assert.equal(run(2500, []), false);
  assert.equal(pauseId, -1);
});

test("subtitle learning analysis announces each finished chunk", async () => {
  const {fillSubtitleWithLearningContent} = await import("../renderer/components/Subtitle/subtitleLanguageSupport");
  const {languageCodes} = await import("../renderer/languages/manifest");
  const globals = globalThis as Record<string, unknown>;
  const saved = globals.window;
  globals.window = {ipc: {invoke: async (_channel: string, batch: unknown[]) => batch.map(() => "")}};
  try {
    let announcements = 0;
    const lines = Array.from({length: 70}, () => ({
      content: "x",
      meaning: [] as string[],
      async fillContentSeparations() {
        this.content = [{origin: "学生", basicForm: "学生", hiragana: "がくせい"}];
      }
    }));
    const subtitle = {language: languageCodes.japanese, lines, frequency: new Map(), progress: "", notifyChanged: () => announcements++};
    await fillSubtitleWithLearningContent(subtitle as never, async () => []);
    assert.equal(announcements, 3);
  } finally {
    if (saved === undefined) delete globals.window;
    else globals.window = saved;
  }
});
