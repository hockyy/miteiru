import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
  adjustTimeWithShift,
  extractVideoId,
  getColorGradient,
  getRelativeTime,
  isArrayEndsWithMatcher,
  isDomainUri,
  isLocalPath,
  isSubtitle,
  isVideo,
  isYoutube,
  joinString,
  sortAndFilterTopXPercentToJson,
  toTime
} from "../renderer/utils/utils";

describe("isVideo / isSubtitle", () => {
  it("matches supported extensions", () => {
    assert.equal(isVideo("/home/user/movie.mkv"), true);
    assert.equal(isVideo("C:\\Videos\\movie.mp4"), true);
    assert.equal(isVideo("song.mp3"), true);
    assert.equal(isVideo("movie.txt"), false);
    assert.equal(isVideo("movie"), false);
  });

  it("matches extensions case-insensitively", () => {
    assert.equal(isVideo("MOVIE.MKV"), true);
    assert.equal(isVideo("Clip.Mp4"), true);
    assert.equal(isSubtitle("SUBS.SRT"), true);
  });

  it("does not match extension substrings", () => {
    assert.equal(isVideo("movie.mkv.backup"), false);
    assert.equal(isSubtitle("notes.srt.txt"), true); // .txt is a supported subtitle format
  });

  it("matches subtitle formats", () => {
    assert.equal(isSubtitle("subs.ass"), true);
    assert.equal(isSubtitle("subs.vtt"), true);
    assert.equal(isSubtitle("subs.mp4"), false);
  });
});

describe("isArrayEndsWithMatcher", () => {
  it("returns false for empty matcher list", () => {
    assert.equal(isArrayEndsWithMatcher("file.mkv", []), false);
  });
});

describe("isYoutube", () => {
  it("accepts common YouTube URL formats", () => {
    assert.equal(isYoutube("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), true);
    assert.equal(isYoutube("http://youtube.com/watch?v=dQw4w9WgXcQ"), true);
    assert.equal(isYoutube("https://youtu.be/dQw4w9WgXcQ"), true);
    assert.equal(isYoutube("https://www.youtube.com/shorts/dQw4w9WgXcQ"), true);
    assert.equal(isYoutube("https://www.youtube.com/embed/dQw4w9WgXcQ"), true);
    assert.equal(isYoutube("https://m.youtube.com/watch?v=dQw4w9WgXcQ"), true);
    assert.equal(isYoutube("www.youtube.com/watch?v=dQw4w9WgXcQ"), true);
  });

  it("rejects lookalike domains (unescaped dot regression)", () => {
    assert.equal(isYoutube("https://youtuXbe/dQw4w9WgXcQ"), false);
    assert.equal(isYoutube("https://wwwXyoutube.com/watch?v=abc"), false);
    assert.equal(isYoutube("https://youtube.com.evil.com/watch?v=abc"), false);
  });

  it("rejects non-YouTube URLs and local paths", () => {
    assert.equal(isYoutube("https://vimeo.com/12345"), false);
    assert.equal(isYoutube("/home/user/video.mkv"), false);
    assert.equal(isYoutube(""), false);
  });
});

describe("extractVideoId", () => {
  it("extracts ID from watch URLs", () => {
    assert.equal(extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  });

  it("strips extra query params", () => {
    assert.equal(extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30"), "dQw4w9WgXcQ");
    assert.equal(extractVideoId("https://youtu.be/dQw4w9WgXcQ?t=30"), "dQw4w9WgXcQ");
  });

  it("extracts ID from shorts/embed/v URLs", () => {
    assert.equal(extractVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
    assert.equal(extractVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
    assert.equal(extractVideoId("https://www.youtube.com/v/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  });

  it("returns null for non-YouTube input", () => {
    assert.equal(extractVideoId("https://vimeo.com/123"), null);
    assert.equal(extractVideoId("/home/user/movie.mkv"), null);
  });
});

describe("isDomainUri / isLocalPath", () => {
  it("detects http(s) URLs", () => {
    assert.equal(isDomainUri("https://example.com/x"), true);
    assert.equal(isDomainUri("http://example.com"), true);
    assert.equal(isDomainUri("ftp://example.com"), false);
  });

  it("treats non-URLs as local paths", () => {
    assert.equal(isLocalPath("/home/user/video.mkv"), true);
    assert.equal(isLocalPath("C:\\Videos\\video.mkv"), true);
    assert.equal(isLocalPath("https://example.com/video.mkv"), false);
  });
});

describe("toTime", () => {
  it("formats seconds, minutes and hours", () => {
    assert.equal(toTime(0), "00:00");
    assert.equal(toTime(5), "00:05");
    assert.equal(toTime(65), "01:05");
    assert.equal(toTime(3599), "59:59");
    assert.equal(toTime(3600), "1:00:00");
    assert.equal(toTime(3661), "1:01:01");
  });

  it("truncates fractional seconds", () => {
    assert.equal(toTime(65.9), "01:05");
  });

  it("clamps negative input to zero", () => {
    assert.equal(toTime(-5), "00:00");
    assert.equal(toTime(-0.5), "00:00");
  });
});

describe("joinString", () => {
  it("joins with default separator", () => {
    assert.equal(joinString(["a", "b", "c"]), "a; b; c");
  });

  it("joins with custom separator and handles empty arrays", () => {
    assert.equal(joinString([1, 2], ","), "1,2");
    assert.equal(joinString([]), "");
  });
});

describe("adjustTimeWithShift", () => {
  it("converts seconds to milliseconds and applies shift", () => {
    assert.equal(adjustTimeWithShift(1.5, 100), 1400);
    assert.equal(adjustTimeWithShift(0, 100), -100);
  });
});

describe("sortAndFilterTopXPercentToJson", () => {
  it("keeps top x percent of entries with frequency > 1", () => {
    const freq = new Map([
      ["common", 100],
      ["mid", 10],
      ["rare", 2],
      ["once", 1],
    ]);
    const result = sortAndFilterTopXPercentToJson(freq, 50);
    // top 50% of 4 entries = 2 entries; "once" is also dropped by the > 1 filter
    assert.deepEqual(result, {common: 100, mid: 10});
  });

  it("handles empty maps", () => {
    assert.deepEqual(sortAndFilterTopXPercentToJson(new Map(), 50), {});
  });
});

describe("getRelativeTime", () => {
  it("describes past and future timestamps", () => {
    const now = Date.now();
    assert.equal(getRelativeTime(now - 30 * 1000), "Just now");
    assert.equal(getRelativeTime(now + 30 * 1000), "In a moment");
    assert.equal(getRelativeTime(now - 5 * 60 * 1000), "5 minutes ago");
    assert.equal(getRelativeTime(now - 60 * 60 * 1000), "1 hour ago");
    assert.equal(getRelativeTime(now - 2 * 24 * 60 * 60 * 1000), "2 days ago");
    assert.equal(getRelativeTime(now + 3 * 24 * 60 * 60 * 1000), "3 days from now");
  });
});

describe("getColorGradient", () => {
  const RGB_PART = /^rgb\((\d+), (\d+), (\d+)\)$/;

  it("produces valid rgb() for recent and old timestamps", () => {
    const now = Date.now();
    for (const ts of [now, now - 15 * 24 * 60 * 60 * 1000, now - 60 * 24 * 60 * 60 * 1000]) {
      const color = getColorGradient(ts);
      const match = RGB_PART.exec(color);
      assert.ok(match, `expected valid rgb(), got ${color}`);
      for (let i = 1; i <= 3; i++) {
        const channel = Number(match[i]);
        assert.ok(channel >= 0 && channel <= 255, `channel out of range in ${color}`);
      }
    }
  });

  it("clamps future timestamps instead of emitting out-of-range channels", () => {
    const color = getColorGradient(Date.now() + 60 * 24 * 60 * 60 * 1000);
    const match = RGB_PART.exec(color);
    assert.ok(match, `expected valid rgb(), got ${color}`);
    for (let i = 1; i <= 3; i++) {
      const channel = Number(match[i]);
      assert.ok(channel >= 0 && channel <= 255, `channel out of range in ${color}`);
    }
  });
});
