import assert from "node:assert/strict";
import {afterEach, test} from "node:test";
import {isEnglishSubtitleName, knownSubtitleTarget, loadMediaPaths} from "../renderer/utils/mediaUtils";

const globalWithWindow = globalThis as unknown as { window?: unknown };

afterEach(() => {
  delete globalWithWindow.window;
});

// Stands in for the preload API: the subtitles beside each video that share its name.
const withSubtitlesBeside = (beside: Record<string, string[]>) => {
  globalWithWindow.window = {electronAPI: {checkSubtitleFile: async (video: string) => beside[video] ?? []}};
};

const loaded = async (paths: string[]) => {
  const calls: { path: string }[][] = [];
  await loadMediaPaths(paths, (files) => calls.push(files));
  return calls;
};

test("loadMediaPaths loads the video, then the subtitles given with it, then those beside it", async () => {
  withSubtitlesBeside({"C:\\show\\ep01.mkv": ["C:\\show\\ep01.srt", "C:\\show\\ep01.en.srt"]});
  // A differently named subtitle dropped with the video used to be ignored.
  const calls = await loaded(["C:\\subs\\[Group] Show 01.ja.ass", "C:\\show\\ep01.mkv", "C:\\show\\ep01.srt"]);
  assert.deepEqual(calls, [
    [{path: "C:\\show\\ep01.mkv"}],
    [{path: "C:\\subs\\[Group] Show 01.ja.ass"}],
    [{path: "C:\\show\\ep01.srt"}],
    [{path: "C:\\show\\ep01.en.srt"}]
  ]);
});

test("loadMediaPaths loads every subtitle when no video is given, one per call", async () => {
  withSubtitlesBeside({});
  // onLoadFiles reads only the first file of each call, so two subtitles in one call lost the second.
  assert.deepEqual(await loaded(["/subs/a.srt", "/subs/a.en.srt"]), [[{path: "/subs/a.srt"}], [{path: "/subs/a.en.srt"}]]);
  assert.deepEqual(await loaded([]), []);
});

test("loadMediaPaths plays only the first video and loads a file once whatever its case on Windows", async () => {
  withSubtitlesBeside({"C:\\show\\Ep01.mkv": ["C:\\show\\Ep01.srt"]});
  // A second video would replace the first and receive its subtitles.
  assert.deepEqual(await loaded(["C:\\show\\Ep01.mkv", "C:\\show\\Ep02.mkv", "C:\\show\\EP01.SRT"]), [
    [{path: "C:\\show\\Ep01.mkv"}],
    [{path: "C:\\show\\EP01.SRT"}]
  ]);
  // POSIX paths keep their case: these are two files.
  withSubtitlesBeside({});
  assert.deepEqual(await loaded(["/subs/A.srt", "/subs/a.srt"]), [[{path: "/subs/A.srt"}], [{path: "/subs/a.srt"}]]);
});

test("knownSubtitleTarget: the requested slot, then an extracted track's, then English to secondary", () => {
  const japanese = "ja";
  const english = "en";
  assert.equal(knownSubtitleTarget("C:\\v\\show.en.srt", japanese, english, "primary"), "primary");
  assert.equal(knownSubtitleTarget("C:\\Temp\\miteiru_subtitle_1_sec_2.srt", japanese, english), "secondary");
  assert.equal(knownSubtitleTarget("C:\\Temp\\miteiru_subtitle_1_2.srt", japanese, english), "primary");
  assert.equal(knownSubtitleTarget("C:\\v\\show.en.srt", japanese, english), "secondary");
  assert.equal(knownSubtitleTarget("C:\\v\\show.en.srt", english, english), undefined);
  assert.equal(knownSubtitleTarget("C:\\v\\show.srt", japanese, english), undefined);
});

test("isEnglishSubtitleName reads the language tag before the extension", () => {
  for (const name of ["show.en.srt", "C:\\a\\Show.EN.ass", "/a/show.eng.vtt", "show.english.srt", "show.en-US.srt"]) {
    assert.equal(isEnglishSubtitleName(name), true, name);
  }
  for (const name of ["show.srt", "show.ja.srt", "/en/show.srt", "Golden.srt", "teen.srt", "show.en.srt.bak.txt"]) {
    assert.equal(isEnglishSubtitleName(name), false, name);
  }
});
