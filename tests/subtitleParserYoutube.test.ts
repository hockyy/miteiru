import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {parseSubtitleCues} from "../main/helpers/subtitleParser";

// The rolling layout of YouTube's speech-recognition captions (ja-orig) as yt-dlp saves them.
const autoCaptions = [
  "WEBVTT", "Kind: captions", "Language: ja", "",
  "00:00:00.030 --> 00:00:02.159 align:start position:0%", " ", "こんにちは<00:00:00.539><c>みなさん</c>", "",
  "00:00:02.159 --> 00:00:02.169 align:start position:0%", "こんにちはみなさん", " ", "",
  "00:00:02.169 --> 00:00:04.350 align:start position:0%", "こんにちはみなさん", "今日は<00:00:02.250><c>雨</c><00:00:03.000><c>です</c>", "",
  "00:00:04.350 --> 00:00:04.360 align:start position:0%", "今日は雨です", " ", "",
  "00:00:04.360 --> 00:00:06.000 align:start position:0%", "今日は雨です", "明日は<00:00:05.000><c>晴れ</c>", "",
].join("\n");

describe("subtitle parser, YouTube auto captions", () => {
  it("keeps every cue's newest line, once, and drops the flash cues", () => {
    const cues = parseSubtitleCues(autoCaptions);
    assert.deepEqual(cues.map((cue) => cue.text), ["こんにちはみなさん", "今日は雨です", "明日は晴れ"]);
    assert.deepEqual(cues.map((cue) => [cue.from, cue.to]), [[30, 2159], [2169, 4350], [4360, 6000]]);
  });

  it("keeps a cue's first line when a spaces-only line opens it", () => {
    const cues = parseSubtitleCues("WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n \nhello <c>there</c><00:00:02.000>\n");
    assert.equal(cues.length, 1);
    assert.equal(cues[0].text, "hello there");
  });

  it("keeps both lines of a timed cue that repeats nothing", () => {
    const cues = parseSubtitleCues("WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nfirst<00:00:01.500><c> line</c>\nsecond<00:00:02.500><c> line</c>\n");
    assert.deepEqual(cues.map((cue) => cue.text), ["first line\nsecond line"]);
  });

  it("still shows a line said twice in a row", () => {
    const cues = parseSubtitleCues("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n \nはい<00:00:01.500><c>はい</c>\n\n"
      + "00:00:02.000 --> 00:00:04.000\nはいはい\nはい<00:00:03.000><c>はい</c>\n");
    assert.deepEqual(cues.map((cue) => cue.text), ["はいはい", "はいはい"]);
  });
});

describe("subtitle parser, ordinary files", () => {
  it("leaves a vtt with only colour tags as it is, every line and every cue", () => {
    const cues = parseSubtitleCues("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<c.yellow>one</c>\n<c.yellow>two</c>\n\n00:00:02.000 --> 00:00:02.050\n<c.yellow>three</c>\n");
    assert.deepEqual(cues.map((cue) => cue.text), ["<c.yellow>one</c>\n<c.yellow>two</c>", "<c.yellow>three</c>"]);
  });

  it("parses a normal vtt with two-line cues unchanged", () => {
    const cues = parseSubtitleCues("WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\nfirst\nsecond\n\n2\n00:00:03.000 --> 00:00:03.050\nquick\n");
    assert.deepEqual(cues.map((cue) => cue.text), ["first\nsecond", "quick"]);
    assert.equal(cues[0].id, "1");
  });

  it("keeps a cue's lines together past a whitespace-only line", () => {
    const cues = parseSubtitleCues("1\n00:00:01,000 --> 00:00:02,000\nfirst\n \nsecond\n\n2\n00:00:03,000 --> 00:00:04,000\nthird\n");
    assert.deepEqual(cues.map((cue) => cue.text), ["first\nsecond", "third"]);
  });

  it("still ends a cue at a spaces-only separator", () => {
    const cues = parseSubtitleCues("1\r\n00:00:01,000 --> 00:00:02,000\r\nfirst\r\n  \r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nsecond\r\n");
    assert.deepEqual(cues.map((cue) => cue.text), ["first", "second"]);
  });
});
