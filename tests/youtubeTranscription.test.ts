import assert from "node:assert/strict";
import {test} from "node:test";
import type {SubtitleEntry} from "../main/helpers/subtitleParser";
import {
  entriesForYoutubeTranscriptionSegment,
  mergeYoutubeTranscriptEntries,
  YoutubeTranscriptionScheduler,
  youtubeTranscriptionWindow,
  type YoutubeTranscriptionRequest,
  type YoutubeTranscriptionState
} from "../renderer/utils/youtubeTranscription";

const cue = (from: number, to: number, text = "hello", id = "1"): SubtitleEntry => ({id, from, to, text});
const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};

test("a multi-hour video only requests the current and next two 30-second buckets", () => {
  const window = youtubeTranscriptionWindow({positionSeconds: 3605, playing: true, durationSeconds: 18000});
  assert.deepEqual(window.map(({index, startSeconds, durationSeconds}) => ({index, startSeconds, durationSeconds})), [
    {index: 120, startSeconds: 3598, durationSeconds: 34},
    {index: 121, startSeconds: 3628, durationSeconds: 34},
    {index: 122, startSeconds: 3658, durationSeconds: 34}
  ]);
  assert.equal(youtubeTranscriptionWindow({positionSeconds: 3605, playing: false}).length, 1);
});

test("segment windows clamp at the video's start and end and never request beyond its duration", () => {
  const window = youtubeTranscriptionWindow({positionSeconds: 0, playing: true, durationSeconds: 65});
  assert.deepEqual(window.map(({startSeconds, durationSeconds}) => [startSeconds, durationSeconds]), [[0, 32], [28, 34], [58, 7]]);
  assert.deepEqual(youtubeTranscriptionWindow({positionSeconds: 65, playing: true, durationSeconds: 65}), []);
  assert.equal(youtubeTranscriptionWindow({positionSeconds: NaN, playing: false})[0].startSeconds, 0);
});

test("absolute subtitle times are not offset again and overlap cues belong to their midpoint bucket", () => {
  const segment = youtubeTranscriptionWindow({positionSeconds: 31, playing: false})[0];
  const entries = entriesForYoutubeTranscriptionSegment([
    cue(27500, 29500, "previous"),
    cue(29000, 31000, "boundary"),
    cue(34000, 36000, "current"),
    cue(59000, 61000, "next"),
    cue(NaN, 35000, "invalid")
  ], segment);
  assert.deepEqual(entries.map(({from, to, text}) => ({from, to, text})), [
    {from: 29000, to: 31000, text: "boundary"},
    {from: 34000, to: 36000, text: "current"}
  ]);
  assert.ok(entries.every(({id}) => id.startsWith("youtube-1-")));
});

test("merging deduplicates overlap recognition while keeping repeated speech later in the video", () => {
  const merged = mergeYoutubeTranscriptEntries([
    [cue(32000, 33000, "Hello"), cue(29200, 31200, "Hello!")],
    [cue(29000, 31000, "hello")]
  ]);
  assert.deepEqual(merged.map(({from, to}) => [from, to]), [[29000, 31200], [32000, 33000]]);
});

test("requests run one at a time and completed segments are reused after seeking back", async () => {
  let active = 0;
  let maximumActive = 0;
  const requests: number[] = [];
  const states: YoutubeTranscriptionState[] = [];
  const scheduler = new YoutubeTranscriptionScheduler({
    videoId: "video-one",
    requestSegment: async (request) => {
      requests.push(request.index);
      maximumActive = Math.max(maximumActive, ++active);
      await nextTurn();
      active--;
      return [cue(request.bucketStartSeconds * 1000 + 1000, request.bucketStartSeconds * 1000 + 2000)];
    },
    onEntries: () => {},
    onState: (state) => states.push(state)
  });
  scheduler.update({positionSeconds: 0, playing: true, durationSeconds: 120});
  await scheduler.whenIdle();
  assert.deepEqual(requests, [0, 1, 2]);
  assert.equal(maximumActive, 1);
  assert.equal(states.at(-1)?.bufferedUntilSeconds, 90);
  scheduler.update({positionSeconds: 35, playing: false, durationSeconds: 120});
  scheduler.update({positionSeconds: 0, playing: true, durationSeconds: 120});
  await scheduler.whenIdle();
  assert.deepEqual(requests, [0, 1, 2]);
  scheduler.update({positionSeconds: 95, playing: false, durationSeconds: 120});
  await scheduler.whenIdle();
  assert.deepEqual(requests, [0, 1, 2, 3]);
  scheduler.dispose();
});

test("paused playback does not generate an unbounded queue or future segments", async () => {
  const requests: number[] = [];
  const scheduler = new YoutubeTranscriptionScheduler({
    videoId: "video-one",
    requestSegment: async ({index}) => { requests.push(index); return []; },
    onEntries: () => {}
  });
  scheduler.update({positionSeconds: 910, playing: false});
  await scheduler.whenIdle();
  for (let count = 0; count < 10; count++) scheduler.update({positionSeconds: 910, playing: false});
  await scheduler.whenIdle();
  assert.deepEqual(requests, [30]);
  scheduler.dispose();
});

test("a far seek aborts irrelevant work and ignores a late result before processing the new position", async () => {
  const old = deferred<SubtitleEntry[]>();
  const requests: YoutubeTranscriptionRequest[] = [];
  const published: SubtitleEntry[][] = [];
  const scheduler = new YoutubeTranscriptionScheduler({
    videoId: "video-one",
    requestSegment: async (request) => {
      requests.push(request);
      return request.index === 0 ? old.promise : [cue(121000, 122000, "new position")];
    },
    onEntries: (entries) => published.push(entries)
  });
  scheduler.update({positionSeconds: 0, playing: true});
  await nextTurn();
  scheduler.update({positionSeconds: 121, playing: false});
  assert.equal(requests[0].signal.aborted, true);
  assert.equal(requests.length, 1, "the aborted request settles before another actual request starts");
  old.resolve([cue(1000, 2000, "stale position")]);
  await scheduler.whenIdle();
  assert.deepEqual(requests.map(({index}) => index), [0, 4]);
  assert.deepEqual(published.flat().map(({text}) => text), ["new position"]);
  scheduler.dispose();
});

test("changing video disposes the previous generation and suppresses its callbacks", async () => {
  const old = deferred<SubtitleEntry[]>();
  let signal: AbortSignal | undefined;
  let published = 0;
  let errors = 0;
  const scheduler = new YoutubeTranscriptionScheduler({
    videoId: "old-video",
    requestSegment: (request) => { signal = request.signal; return old.promise; },
    onEntries: () => published++,
    onError: () => errors++
  });
  scheduler.update({positionSeconds: 0, playing: false});
  await nextTurn();
  scheduler.dispose();
  assert.equal(signal?.aborted, true);
  old.resolve([cue(1000, 2000)]);
  await scheduler.whenIdle();
  scheduler.update({positionSeconds: 50, playing: true});
  scheduler.retry();
  assert.equal(published, 0);
  assert.equal(errors, 0);
});

test("a transcription error stops paid requests until an explicit retry", async () => {
  let calls = 0;
  const errors: string[] = [];
  const scheduler = new YoutubeTranscriptionScheduler({
    videoId: "video-one",
    requestSegment: async () => { if (++calls === 1) throw new Error("rate limit"); return []; },
    onEntries: () => {},
    onError: (error) => errors.push(error.message)
  });
  scheduler.update({positionSeconds: 0, playing: true});
  await scheduler.whenIdle();
  scheduler.update({positionSeconds: 1, playing: true});
  await scheduler.whenIdle();
  assert.equal(calls, 1);
  assert.deepEqual(errors, ["rate limit"]);
  scheduler.retry();
  await scheduler.whenIdle();
  assert.equal(calls, 4);
  scheduler.dispose();
});

test('presentation changes can refresh prepared cues without another audio request', async () => {
  let requests = 0;
  const published: SubtitleEntry[][] = [];
  const scheduler = new YoutubeTranscriptionScheduler({
    videoId: 'video-one',
    requestSegment: async () => { requests++; return [cue(1000, 2000)]; },
    onEntries: (entries) => published.push(entries)
  });
  scheduler.update({positionSeconds: 0, playing: false});
  await scheduler.whenIdle();
  scheduler.refreshEntries();
  assert.equal(requests, 1);
  assert.equal(published.length, 2);
  assert.deepEqual(published[0], published[1]);
  scheduler.dispose();
  scheduler.refreshEntries();
  assert.equal(published.length, 2);
});

test('drag previews cancel obsolete work and never request transcription until committed', async () => {
  let calls = 0;
  let signal: AbortSignal | undefined;
  const old = deferred<SubtitleEntry[]>();
  const scheduler = new YoutubeTranscriptionScheduler({
    videoId: 'video-one',
    requestSegment: (request) => {
      calls++;
      signal = request.signal;
      return calls === 1 ? old.promise : Promise.resolve([]);
    },
    onEntries: () => {}
  });
  scheduler.update({positionSeconds: 0, playing: false});
  await nextTurn();
  scheduler.update({positionSeconds: 70, playing: true, previewing: true});
  assert.equal(signal?.aborted, true);
  old.resolve([cue(1000, 2000)]);
  await scheduler.whenIdle();
  scheduler.update({positionSeconds: 100, playing: true, previewing: true});
  await scheduler.whenIdle();
  assert.equal(calls, 1);
  assert.deepEqual(youtubeTranscriptionWindow({positionSeconds: 100, playing: true, previewing: true}), []);
  scheduler.update({positionSeconds: 100, playing: false, previewing: false});
  await scheduler.whenIdle();
  assert.equal(calls, 2);
  scheduler.dispose();
});
