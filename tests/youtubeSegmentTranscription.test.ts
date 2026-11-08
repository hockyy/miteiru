import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {test, type TestContext} from "node:test";
import {
  buildYoutubeSegmentFfmpegArgs,
  createYoutubeSegmentTranscriber,
  validateYoutubeSegmentRequest,
  type YoutubeAudioSource
} from "../main/helpers/youtubeSegmentTranscription";
import {DEFAULT_ASR_MODEL} from "../renderer/utils/generateSubtitlesConfig";

const source: YoutubeAudioSource = {
  url: "https://example.com/audio.m3u8?signature=123",
  headers: {"User-Agent": "Miteiru", Referer: "https://www.youtube.com/"},
  duration: 18_000
};
const request = (overrides: Record<string, unknown> = {}) => ({
  videoPath: "https://www.youtube.com/watch?v=abcdefghijk",
  lang: "ja",
  asrModel: DEFAULT_ASR_MODEL,
  startSeconds: 120,
  durationSeconds: 30,
  requestId: "segment-one",
  ...overrides
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return {promise, resolve, reject};
};

const temporaryCache = async (t: TestContext) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "miteiru-segment-test-"));
  t.after(async () => {
    const absolute = path.resolve(directory);
    assert.equal(path.dirname(absolute), path.resolve(os.tmpdir()));
    assert.ok(path.basename(absolute).startsWith("miteiru-segment-test-"));
    await fs.rm(absolute, {recursive: true, force: true});
  });
  return directory;
};

test("segment validation accepts YouTube links and rejects unbounded or invalid windows", () => {
  const normalized = validateYoutubeSegmentRequest(request({startSeconds: 120.1234}));
  assert.equal(normalized.videoID, "abcdefghijk");
  assert.equal(normalized.startSeconds, 120.123);
  assert.equal(normalized.durationSeconds, 30);

  for (const bad of [
    {videoPath: "C:\\Videos\\file.mp4"},
    {videoPath: "https://example.com/watch?v=abcdefghijk"},
    {lang: ""},
    {startSeconds: -1},
    {startSeconds: Number.NaN},
    {startSeconds: Number.POSITIVE_INFINITY},
    {durationSeconds: 0},
    {durationSeconds: 0.1},
    {durationSeconds: 91},
    {durationSeconds: Number.NaN}
  ]) {
    assert.throws(() => validateYoutubeSegmentRequest(request(bad)), JSON.stringify(bad));
  }
});

test("FFmpeg seeks the remote input before opening it and bounds audio output", () => {
  const args = buildYoutubeSegmentFfmpegArgs({audio: source, start: 3600, duration: 30, outputPath: "segment.mp3"});
  const input = args.indexOf("-i");
  const seek = args.indexOf("-ss");
  const duration = args.indexOf("-t");
  assert.ok(seek >= 0 && seek < input);
  assert.equal(Number(args[seek + 1]), 3600);
  assert.equal(args[input + 1], source.url);
  assert.ok(duration >= 0 && duration < args.length - 1);
  assert.equal(Number(args[duration + 1]), 30);
  assert.ok(args.includes("-vn"));
  assert.equal(args.at(-1), "segment.mp3");
});

test("transcribes only the requested audio and emits clamped absolute millisecond cues", async (t) => {
  const cacheDir = await temporaryCache(t);
  let resolutions = 0;
  let extractions = 0;
  let transcriptions = 0;
  const service = createYoutubeSegmentTranscriber({
    cacheDir,
    resolveAudio: async (videoID) => {
      assert.equal(videoID, "abcdefghijk");
      resolutions++;
      return source;
    },
    extractAudio: async (options) => {
      extractions++;
      assert.equal(options.start, 120);
      assert.equal(options.duration, 30);
      assert.equal(options.audio.url, source.url);
      await fs.writeFile(options.outputPath, "bounded audio");
    },
    transcribeAudio: async (options) => {
      transcriptions++;
      assert.equal(options.apiKey, "test-key");
      assert.equal(options.model, DEFAULT_ASR_MODEL);
      assert.equal(options.language, "ja");
      assert.equal(options.format, "mp3");
      assert.equal(Buffer.from(options.audioBase64, "base64").toString(), "bounded audio");
      return {segments: [
        {start: -2, end: 1.25, text: "最初"},
        {start: 1.25, end: 2.5, text: "次"},
        {start: 29, end: 99, text: "最後"}
      ]};
    }
  });
  const entries = await service.transcribeSegment(request(), "test-key");
  assert.deepEqual(entries.map(({from, to, text}) => ({from, to, text})), [
    {from: 120_000, to: 121_250, text: "最初"},
    {from: 121_250, to: 122_500, text: "次"},
    {from: 149_000, to: 150_000, text: "最後"}
  ]);
  assert.ok(entries.every((entry) => typeof entry.id === "string" && entry.id.length > 0));
  assert.deepEqual([resolutions, extractions, transcriptions], [1, 1, 1]);
});

test("completed transcripts survive service recreation without another resolve, download or paid call", async (t) => {
  const cacheDir = await temporaryCache(t);
  const initial = createYoutubeSegmentTranscriber({
    cacheDir,
    resolveAudio: async () => source,
    extractAudio: async ({outputPath}) => { await fs.writeFile(outputPath, "audio"); },
    transcribeAudio: async () => ({segments: [{start: 0, end: 1, text: "cached"}]})
  });
  const original = await initial.transcribeSegment(request(), "key");
  const fromDisk = createYoutubeSegmentTranscriber({
    cacheDir,
    resolveAudio: async () => { assert.fail("A completed segment must not resolve YouTube again."); },
    extractAudio: async () => { assert.fail("A completed segment must not download audio again."); },
    transcribeAudio: async () => { assert.fail("A completed segment must not call ASR again."); }
  });
  assert.deepEqual(await fromDisk.transcribeSegment(request({requestId: "new-subscriber"}), "key"), original);
});

test("resolved audio metadata is reused on disk for a different upcoming segment", async (t) => {
  const cacheDir = await temporaryCache(t);
  const initial = createYoutubeSegmentTranscriber({
    cacheDir,
    resolveAudio: async () => source,
    extractAudio: async ({outputPath}) => { await fs.writeFile(outputPath, "audio"); },
    transcribeAudio: async () => ({segments: [{start: 0, end: 1, text: "first"}]})
  });
  await initial.transcribeSegment(request(), "key");
  let downloaded = 0;
  let transcribed = 0;
  const next = createYoutubeSegmentTranscriber({
    cacheDir,
    resolveAudio: async () => { assert.fail("An unexpired audio URL must be reused for the next window."); },
    extractAudio: async ({audio, start, outputPath}) => {
      downloaded++;
      assert.equal(audio.url, source.url);
      assert.equal(start, 150);
      await fs.writeFile(outputPath, "next audio");
    },
    transcribeAudio: async () => {
      transcribed++;
      return {segments: [{start: 0, end: 1, text: "next"}]};
    }
  });
  const entries = await next.transcribeSegment(request({startSeconds: 150}), "key");
  assert.equal(entries[0].from, 150_000);
  assert.deepEqual([downloaded, transcribed], [1, 1]);
});

test("segment cache keys separate video, language, model, start and length", async (t) => {
  const cacheDir = await temporaryCache(t);
  let calls = 0;
  const service = createYoutubeSegmentTranscriber({
    cacheDir,
    resolveAudio: async () => source,
    extractAudio: async ({outputPath}) => { await fs.writeFile(outputPath, "audio"); },
    transcribeAudio: async () => { calls++; return {segments: [{start: 0, end: 1, text: "line"}]}; }
  });
  await service.transcribeSegment(request(), "key");
  await service.transcribeSegment(request({requestId: "same-window"}), "key");
  for (const distinct of [
    {videoPath: "https://youtu.be/another1234"},
    {lang: "yue"},
    {asrModel: "openai/whisper-large-v3"},
    {startSeconds: 150},
    {durationSeconds: 20}
  ]) await service.transcribeSegment(request(distinct), "key");
  assert.equal(calls, 6);
});

test("simultaneous requests for one segment share the download and ASR request", async (t) => {
  const cacheDir = await temporaryCache(t);
  const entered = deferred<void>();
  const response = deferred<{segments: {start: number; end: number; text: string}[]}>();
  let extracted = 0;
  let transcribed = 0;
  const service = createYoutubeSegmentTranscriber({
    cacheDir,
    resolveAudio: async () => source,
    extractAudio: async ({outputPath}) => { extracted++; await fs.writeFile(outputPath, "audio"); },
    transcribeAudio: async () => { transcribed++; entered.resolve(); return response.promise; }
  });
  const first = service.transcribeSegment(request(), "key");
  const second = service.transcribeSegment(request({requestId: "second"}), "key");
  await entered.promise;
  response.resolve({segments: [{start: 0, end: 1, text: "shared"}]});
  const [a, b] = await Promise.all([first, second]);
  assert.deepEqual(a, b);
  assert.deepEqual([extracted, transcribed], [1, 1]);
});

test("a pre-cancelled request never starts audio resolution or ASR", async (t) => {
  const cacheDir = await temporaryCache(t);
  const controller = new AbortController();
  controller.abort();
  const service = createYoutubeSegmentTranscriber({
    cacheDir,
    resolveAudio: async () => { assert.fail("Already-cancelled jobs must not start."); },
    extractAudio: async () => { assert.fail("Already-cancelled jobs must not download."); },
    transcribeAudio: async () => { assert.fail("Already-cancelled jobs must not incur ASR costs."); }
  });
  await assert.rejects(service.transcribeSegment(request(), "key", controller.signal), /cancel|abort/i);
});

test("cancelling one subscriber leaves a shared segment running for the other", async (t) => {
  const cacheDir = await temporaryCache(t);
  const controller = new AbortController();
  const entered = deferred<void>();
  const response = deferred<{segments: {start: number; end: number; text: string}[]}>();
  let sharedSignal: AbortSignal;
  let calls = 0;
  const service = createYoutubeSegmentTranscriber({
    cacheDir,
    resolveAudio: async () => source,
    extractAudio: async ({outputPath}) => { await fs.writeFile(outputPath, "audio"); },
    transcribeAudio: async ({signal}) => {
      calls++;
      sharedSignal = signal;
      entered.resolve();
      return response.promise;
    }
  });
  const a = service.transcribeSegment(request(), "key", controller.signal);
  const b = service.transcribeSegment(request({requestId: "retained"}), "key");
  await entered.promise;
  controller.abort();
  await assert.rejects(a, /cancel|abort/i);
  assert.equal(sharedSignal.aborted, false);
  response.resolve({segments: [{start: 0, end: 1, text: "still useful"}]});
  assert.equal((await b)[0].text, "still useful");
  assert.equal(calls, 1);
});

test("cancellation during audio extraction stops before ASR and allows a fresh retry", async (t) => {
  const cacheDir = await temporaryCache(t);
  const controller = new AbortController();
  const extracting = deferred<void>();
  let extracts = 0;
  let transcriptions = 0;
  const service = createYoutubeSegmentTranscriber({
    cacheDir,
    resolveAudio: async () => source,
    extractAudio: async ({signal, outputPath}) => {
      extracts++;
      if (extracts > 1) {
        await fs.writeFile(outputPath, "retry audio");
        return;
      }
      extracting.resolve();
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("extraction aborted")), {once: true});
      });
    },
    transcribeAudio: async () => { transcriptions++; return {segments: [{start: 0, end: 1, text: "retry"}]}; }
  });
  const first = service.transcribeSegment(request(), "key", controller.signal);
  await extracting.promise;
  controller.abort();
  await assert.rejects(first, /cancel|abort/i);
  assert.equal(transcriptions, 0);
  assert.equal((await service.transcribeSegment(request({requestId: "retry"}), "key"))[0].text, "retry");
  assert.deepEqual([extracts, transcriptions], [2, 1]);
});

test("silence is cached as a completed empty segment", async (t) => {
  const cacheDir = await temporaryCache(t);
  let calls = 0;
  const service = createYoutubeSegmentTranscriber({
    cacheDir,
    resolveAudio: async () => source,
    extractAudio: async ({outputPath}) => { await fs.writeFile(outputPath, "silence"); },
    transcribeAudio: async () => { calls++; return {text: "", segments: []}; }
  });
  assert.deepEqual(await service.transcribeSegment(request(), "key"), []);
  assert.deepEqual(await service.transcribeSegment(request({requestId: "repeat"}), "key"), []);
  assert.equal(calls, 1);
});
