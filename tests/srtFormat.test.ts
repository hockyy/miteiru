import assert from "node:assert/strict";
import path from "node:path";
import {describe, it} from "node:test";
import {
  cuesFromTranscription,
  cuesToSrt,
  formatSrtTimestampFromSeconds,
  parseSrtCues,
  sanitizeSubtitleStem,
  siblingEnglishSrtPath,
  splitCues
} from "../main/helpers/srtFormat";

describe("formatSrtTimestampFromSeconds", () => {
  it("formats hours minutes seconds and milliseconds", () => {
    assert.equal(formatSrtTimestampFromSeconds(0), "00:00:00,000");
    assert.equal(formatSrtTimestampFromSeconds(1.234), "00:00:01,234");
    assert.equal(formatSrtTimestampFromSeconds(3661.5), "01:01:01,500");
  });
});

describe("splitCues", () => {
  it("splits on CJK punctuation and interpolates times by length", () => {
    const cues = splitCues("你好，世界。测试", 10, 20, 4);
    assert.ok(cues.length >= 2);
    assert.equal(cues[0].start, 10);
    assert.equal(cues[cues.length - 1].end, 20);
    assert.equal(cues.map((cue) => cue.text).join(""), "你好，世界。测试");
  });

  it("returns [] for empty text", () => {
    assert.deepEqual(splitCues("   ", 0, 1), []);
  });

  it("keeps spaces between clauses and breaks long lines between words in spaced languages", () => {
    assert.deepEqual(splitCues("Chào! Bạn khỏe không?", 0, 2, 42).map((cue) => cue.text), ["Chào! Bạn khỏe không?"]);
    const long = "một hai ba bốn năm sáu bảy tám chín mười một hai ba bốn năm sáu bảy tám chín mười";
    const lines = splitCues(long, 0, 4, 20).map((cue) => cue.text);
    assert.equal(lines.join(" "), long);
    for (const line of lines) assert.ok(!line.startsWith(" ") && !line.endsWith(" "), line);
    assert.ok(lines.every((line) => long.split(" ").includes(line.split(" ")[0])), "no word is cut");
  });
});

describe("cuesFromTranscription", () => {
  it("uses segments when present", () => {
    const cues = cuesFromTranscription({
      segments: [
        {text: "你好。", start: 0, end: 1},
        {text: "世界", start: 1, end: 2}
      ]
    }, 5);
    assert.ok(cues.length >= 2);
    assert.equal(cues[0].start, 5);
    assert.equal(cues[cues.length - 1].end, 7);
  });

  it("falls back to full text and duration", () => {
    const cues = cuesFromTranscription({text: "hello world", duration: 2}, 3, {maxChars: 40});
    assert.equal(cues.length, 1);
    assert.equal(cues[0].start, 3);
    assert.equal(cues[0].end, 5);
    assert.equal(cues[0].text, "hello world");
  });
});

describe("cuesToSrt / parseSrtCues", () => {
  it("round-trips cue text and timestamps", () => {
    const srt = cuesToSrt([
      {start: 1, end: 2.5, text: "Hello"},
      {start: 3, end: 4, text: "World"}
    ]);
    assert.match(srt, /1\n00:00:01,000 --> 00:00:02,500\nHello/);
    const parsed = parseSrtCues(srt);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].text, "Hello");
    assert.equal(parsed[1].text, "World");
    assert.equal(parsed[0].start, 1);
    assert.equal(parsed[0].end, 2.5);
  });
});

describe("siblingEnglishSrtPath", () => {
  it("replaces the language tag with en", () => {
    assert.equal(
      path.basename(siblingEnglishSrtPath("C:\\Users\\me\\Documents\\miteiru\\clip.yue.srt")),
      "clip.en.srt"
    );
    assert.equal(path.basename(siblingEnglishSrtPath("/tmp/show.ja.srt")), "show.en.srt");
  });
});

describe("sanitizeSubtitleStem", () => {
  it("strips reserved filename characters", () => {
    assert.equal(sanitizeSubtitleStem('a<>:"/\\|?*b'), "a b");
    assert.equal(sanitizeSubtitleStem("   "), "video");
  });
});
