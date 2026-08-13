import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
  buildVideoSource,
  getEmbeddedSubtitleTarget,
  getFileNameFromPath,
  getLanguageEmoji,
  getTrackLabel,
  getYoutubeVideoId,
  isEmbeddedSubtitlePath,
  normalizeDroppedPath
} from "../renderer/utils/mediaUtils";

describe("normalizeDroppedPath", () => {
  it("leaves URLs untouched", () => {
    const {currentPath, pathUri} = normalizeDroppedPath("https://www.youtube.com/watch?v=abc");
    assert.equal(currentPath, "https://www.youtube.com/watch?v=abc");
    assert.equal(pathUri, "https://www.youtube.com/watch?v=abc");
  });

  it("normalizes Windows backslashes for local paths", () => {
    const {currentPath} = normalizeDroppedPath("C:\\Videos\\movie.mp4");
    assert.equal(currentPath, "C:/Videos/movie.mp4");
  });

  it("keeps forward slashes on POSIX paths", () => {
    const {currentPath, pathUri} = normalizeDroppedPath("/home/user/movie.mp4");
    assert.equal(currentPath, "/home/user/movie.mp4");
    assert.equal(pathUri, "/home/user/movie.mp4");
  });
});

describe("buildVideoSource", () => {
  it("builds a youtube source for YouTube URLs", () => {
    assert.deepEqual(buildVideoSource("https://youtu.be/abc", "https://youtu.be/abc"), {
      type: "video/youtube",
      src: "https://youtu.be/abc",
      path: "https://youtu.be/abc"
    });
  });

  it("builds a miteiru:// source for local files", () => {
    assert.deepEqual(buildVideoSource("/home/user/movie.mp4", "/home/user/movie.mp4"), {
      type: "video/webm",
      src: "miteiru:///home/user/movie.mp4",
      path: "/home/user/movie.mp4"
    });
  });
});

describe("embedded subtitle helpers", () => {
  it("detects embedded subtitle markers", () => {
    assert.equal(isEmbeddedSubtitlePath("/tmp/miteiru_subtitle_0.ass"), true);
    assert.equal(isEmbeddedSubtitlePath("/tmp/miteiru_youtube_en.srt"), true);
    assert.equal(isEmbeddedSubtitlePath("/home/user/subs.srt"), false);
  });

  it("routes secondary tracks by name", () => {
    assert.equal(getEmbeddedSubtitleTarget("/tmp/miteiru_subtitle_secondary_0.ass"), "secondary");
    assert.equal(getEmbeddedSubtitleTarget("/tmp/miteiru_subtitle_sec_0.ass"), "secondary");
    assert.equal(getEmbeddedSubtitleTarget("/tmp/miteiru_subtitle_0.ass"), "primary");
  });
});

describe("getFileNameFromPath", () => {
  it("extracts the file name from POSIX paths", () => {
    assert.equal(getFileNameFromPath("/home/user/movie.mp4"), "movie.mp4");
  });

  it("extracts the file name from Windows paths", () => {
    assert.equal(getFileNameFromPath("C:\\Videos\\movie.mp4"), "movie.mp4");
  });

  it("falls back for empty input", () => {
    assert.equal(getFileNameFromPath(""), "Unknown file");
  });

  it("returns the name for bare file names", () => {
    assert.equal(getFileNameFromPath("movie.mp4"), "movie.mp4");
  });
});

describe("getYoutubeVideoId", () => {
  it("extracts IDs from all supported URL shapes", () => {
    assert.equal(getYoutubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
    assert.equal(getYoutubeVideoId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
    assert.equal(getYoutubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
    assert.equal(getYoutubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
    assert.equal(getYoutubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42"), "dQw4w9WgXcQ");
  });

  it("accepts bare 11-character IDs", () => {
    assert.equal(getYoutubeVideoId("dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  });

  it("returns null for non-matching input", () => {
    assert.equal(getYoutubeVideoId("https://vimeo.com/123"), null);
    assert.equal(getYoutubeVideoId("too-short"), null);
  });
});

describe("getLanguageEmoji", () => {
  it("maps known languages case-insensitively", () => {
    assert.equal(getLanguageEmoji("japanese"), "🇯🇵");
    assert.equal(getLanguageEmoji("JPN"), "🇯🇵");
    assert.equal(getLanguageEmoji("zh-CN"), "🇨🇳");
    assert.equal(getLanguageEmoji("yue"), "🇭🇰");
    assert.equal(getLanguageEmoji("vie"), "🇻🇳");
    assert.equal(getLanguageEmoji("en"), "🇺🇸");
  });

  it("falls back for unknown or missing languages", () => {
    assert.equal(getLanguageEmoji("klingon"), "🌐");
    assert.equal(getLanguageEmoji(undefined), "🌐");
  });
});

describe("getTrackLabel", () => {
  it("combines title, language and default flag", () => {
    assert.equal(
      getTrackLabel({index: 0, type: "subtitle", codec: "ass", title: "English", language: "en", default: true}),
      "English (EN) [Default]"
    );
  });

  it("falls back to the 1-based track index", () => {
    assert.equal(getTrackLabel({index: 2, type: "audio", codec: "aac"}), "Track 3");
  });
});
