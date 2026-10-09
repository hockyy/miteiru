import assert from "node:assert/strict";
import {afterEach, test} from "node:test";
import {isEnglishSubtitleName, loadMediaPaths} from "../renderer/utils/mediaUtils";

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

test("isEnglishSubtitleName reads the language tag before the extension", () => {
  for (const name of ["show.en.srt", "C:\\a\\Show.EN.ass", "/a/show.eng.vtt", "show.english.srt", "show.en-US.srt"]) {
    assert.equal(isEnglishSubtitleName(name), true, name);
  }
  for (const name of ["show.srt", "show.ja.srt", "/en/show.srt", "Golden.srt", "teen.srt", "show.en.srt.bak.txt"]) {
    assert.equal(isEnglishSubtitleName(name), false, name);
  }
});
