import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {matchingSubtitleForVideo, samePathKey, subtitleSuffixAfterVideo} from "../renderer/utils/mediaUtils";

describe("samePathKey", () => {
  it("treats a dropped Windows path and a forward-slash lookup path as the same file", () => {
    assert.equal(samePathKey("C:\\v\\Show.ja.srt"), samePathKey("C:/v/show.ja.srt"));
  });

  it("keeps the case of POSIX paths", () => {
    assert.notEqual(samePathKey("/v/Show.srt"), samePathKey("/v/show.srt"));
    assert.equal(samePathKey("/v/Show.srt"), "/v/Show.srt");
  });
});

describe("subtitleSuffixAfterVideo", () => {
  it("is the part after the video's name", () => {
    assert.equal(subtitleSuffixAfterVideo("/v/ep01.mkv", "/v/ep01.ja.srt"), ".ja.srt");
    assert.equal(subtitleSuffixAfterVideo("/v/ep01.mkv", "/v/ep01.srt"), ".srt");
  });

  it("ignores case only on Windows", () => {
    assert.equal(subtitleSuffixAfterVideo("C:\\v\\EP01.mkv", "C:/v/ep01.ja.srt"), ".ja.srt");
    assert.equal(subtitleSuffixAfterVideo("/v/EP01.mkv", "/v/ep01.ja.srt"), null);
  });

  it("is null for a subtitle not named after its video", () => {
    assert.equal(subtitleSuffixAfterVideo("/v/Show - 01.mkv", "/v/[Group] Show 01.ja.ass"), null);
    // ep010 is another episode, not ep01 with a suffix.
    assert.equal(subtitleSuffixAfterVideo("/v/ep01.mkv", "/v/ep010.srt"), null);
  });
});

describe("matchingSubtitleForVideo", () => {
  const beside = ["/v/ep02.en.srt", "/v/ep02.ja.srt"];

  it("finds the next video's subtitle with the same suffix", () => {
    assert.equal(matchingSubtitleForVideo("/v/ep01.mkv", "/v/ep01.ja.srt", "/v/ep02.mkv", beside), "/v/ep02.ja.srt");
    assert.equal(matchingSubtitleForVideo("/v/ep01.mkv", "/v/ep01.en.srt", "/v/ep02.mkv", beside), "/v/ep02.en.srt");
  });

  it("matches across case and slash differences on Windows", () => {
    assert.equal(
      matchingSubtitleForVideo("C:\\v\\ep01.mkv", "C:/v/EP01.JA.srt", "C:\\v\\ep02.mkv", ["C:/v/ep02.ja.srt"]),
      "C:/v/ep02.ja.srt"
    );
  });

  it("is empty when the next video has no such subtitle", () => {
    assert.equal(matchingSubtitleForVideo("/v/ep01.mkv", "/v/ep01.ja.srt", "/v/ep02.mkv", ["/v/ep02.en.srt"]), "");
  });

  it("is empty for a subtitle not named after its video", () => {
    assert.equal(matchingSubtitleForVideo("/v/ep01.mkv", "/v/x.ja.srt", "/v/ep02.mkv", beside), "");
  });
});
