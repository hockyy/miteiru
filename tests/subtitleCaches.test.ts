import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {
  FileIdentityCache,
  isNormalizedSubtitlePath,
  NORMALIZED_SUBTITLE_PREFIX,
  normalizedSubtitleOutputPath
} from "../main/helpers/subtitleCaches";
import {isMiteiruTempSubtitle} from "../renderer/utils/mediaUtils";

describe("isNormalizedSubtitlePath", () => {
  it("detects miteiru normalized temp files including stacked names", () => {
    assert.equal(isNormalizedSubtitlePath("C:\\Temp\\show.srt"), false);
    assert.equal(
      isNormalizedSubtitlePath(path.join(os.tmpdir(), `${NORMALIZED_SUBTITLE_PREFIX}abc.srt`)),
      true
    );
    assert.equal(
      isNormalizedSubtitlePath(`${NORMALIZED_SUBTITLE_PREFIX}${NORMALIZED_SUBTITLE_PREFIX}abc.srt`),
      true
    );
  });
  it("is one of the temp subtitles the renderer never steps through, on Windows and POSIX paths", () => {
    for (const filePath of [
      `C:\\Users\\me\\AppData\\Local\\Temp\\${NORMALIZED_SUBTITLE_PREFIX}0089622176c3300f.srt`,
      `/tmp/${NORMALIZED_SUBTITLE_PREFIX}abc.srt`,
      "C:\\Temp\\miteiru_subtitle_1787979208175_2.srt",
      "/tmp/miteiru_youtube_abc/1hI-7vj2FhE.en.vtt"
    ]) {
      assert.equal(isMiteiruTempSubtitle(filePath), true, filePath);
    }
    for (const filePath of ["C:\\Videos\\ep01.srt", "/home/me/ep01.srt", `/videos/${NORMALIZED_SUBTITLE_PREFIX}/ep01.srt`, ""]) {
      assert.equal(isMiteiruTempSubtitle(filePath), false, filePath);
    }
  });
});

describe("normalizedSubtitleOutputPath", () => {
  it("uses a short stable hash instead of the source basename", () => {
    const source = "C:\\Users\\miki\\AppData\\Local\\Temp\\miteiru_youtube_1hI-7vj2FhE_en_123.srt";
    const first = normalizedSubtitleOutputPath(source, "C:\\Temp");
    const second = normalizedSubtitleOutputPath(source, "C:\\Temp");
    assert.equal(first, second);
    assert.match(path.basename(first), new RegExp(`^${NORMALIZED_SUBTITLE_PREFIX}[a-f0-9]{16}\\.srt$`));
    assert.ok(path.basename(first).length < 40);
  });
});

describe("FileIdentityCache", () => {
  it("returns a hit only when mtime and size match", () => {
    const cache = new FileIdentityCache<string>();
    cache.set("a.srt", {mtimeMs: 1, size: 10}, "cached");
    assert.equal(cache.get("a.srt", {mtimeMs: 1, size: 10}), "cached");
    assert.equal(cache.get("a.srt", {mtimeMs: 2, size: 10}), undefined);
    assert.equal(cache.get("b.srt", {mtimeMs: 1, size: 10}), undefined);
  });
});
