import assert from "node:assert/strict";
import {afterEach, test} from "node:test";
import {MediaAnalyzer, setNativeSubtitleReader, type NativeSubtitleReader} from "../main/helpers/mediaAnalyzer";

const track = (index: number, codec: string) => ({index, type: "subtitle" as const, codec});
const mkvInfo = {
  duration: 60,
  audioTracks: [],
  videoTracks: [],
  subtitleTracks: [track(2, "subrip"), track(3, "hdmv_pgs_subtitle"), track(4, "ass")]
};

const reader = (overrides: Partial<NativeSubtitleReader> = {}) => {
  const calls: string[] = [];
  const fake: NativeSubtitleReader = {
    tracks: async (path) => {
      calls.push(`tracks ${path}`);
      return path.endsWith(".mkv") ? mkvInfo : null;
    },
    extract: async (path, index) => {
      calls.push(`extract ${path} ${index}`);
      return `/tmp/miteiru_subtitle_1_${index}.srt`;
    },
    ...overrides
  };
  setNativeSubtitleReader(fake);
  return calls;
};

afterEach(() => setNativeSubtitleReader(null));

test("analyzeFile uses the native tracks for a Matroska file, without looking for ffprobe", async () => {
  const calls = reader();
  assert.deepEqual(await MediaAnalyzer.analyzeFile("/v/ep01.mkv"), mkvInfo);
  assert.deepEqual(calls, ["tracks /v/ep01.mkv"]);
});

test("analyzeFile falls back to ffprobe for other files and for native errors", async () => {
  // No ffprobe in the test environment, so reaching it is the ffprobe error.
  reader();
  await assert.rejects(MediaAnalyzer.analyzeFile("/v/ep01.mp4"), /ffprobe/i);
  reader({tracks: async () => { throw new Error("corrupt file"); }});
  await assert.rejects(MediaAnalyzer.analyzeFile("/v/ep01.mkv"), /ffprobe/i);
});

test("a text track is extracted natively", async () => {
  const calls = reader();
  assert.equal(await MediaAnalyzer.extractSubtitleNatively("/v/ep01.mkv", 4), "/tmp/miteiru_subtitle_1_4.srt");
  assert.deepEqual(calls, ["tracks /v/ep01.mkv", "extract /v/ep01.mkv 4"]);
});

test("picture tracks, unknown tracks and other containers are left to FFmpeg", async () => {
  const calls = reader();
  assert.equal(await MediaAnalyzer.extractSubtitleNatively("/v/ep01.mkv", 3), null);
  assert.equal(await MediaAnalyzer.extractSubtitleNatively("/v/ep01.mkv", 9), null);
  assert.equal(await MediaAnalyzer.extractSubtitleNatively("/v/ep01.mp4", 2), null);
  assert.equal(calls.some((call) => call.startsWith("extract")), false);
});

test("a native listing error leaves extraction to FFmpeg, but an extraction error is reported", async () => {
  reader({tracks: async () => { throw new Error("corrupt file"); }});
  assert.equal(await MediaAnalyzer.extractSubtitleNatively("/v/ep01.mkv", 2), null);
  reader({extract: async () => { throw new Error("the file is truncated"); }});
  await assert.rejects(MediaAnalyzer.extractSubtitleNatively("/v/ep01.mkv", 2), /truncated/);
});

test("without a reader everything is FFmpeg's", async () => {
  assert.equal(await MediaAnalyzer.extractSubtitleNatively("/v/ep01.mkv", 2), null);
});
