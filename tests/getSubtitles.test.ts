import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
  findBestLanguageMatch,
  parseAvailableLanguages,
  parseSrtContent,
  timeToSeconds
} from "../main/helpers/getSubtitles";

describe("timeToSeconds", () => {
  it("converts hh:mm:ss.mmm to seconds", () => {
    assert.equal(timeToSeconds("00:00:01.234"), 1.234);
    assert.equal(timeToSeconds("00:01:00.000"), 60);
    assert.equal(timeToSeconds("01:00:00.000"), 3600);
    assert.equal(timeToSeconds("01:01:01.500"), 3661.5);
  });
});

describe("parseSrtContent", () => {
  it("parses a basic SRT block", () => {
    const srt = "1\n00:00:01,000 --> 00:00:04,000\nHello world\n\n2\n00:00:05,000 --> 00:00:06,500\nSecond line\n";
    assert.deepEqual(parseSrtContent(srt), [
      {start: "1.000", dur: "3.000", text: "Hello world"},
      {start: "5.000", dur: "1.500", text: "Second line"},
    ]);
  });

  it("handles CRLF line endings", () => {
    const srt = "1\r\n00:00:01,000 --> 00:00:02,000\r\nHello\r\n\r\n";
    assert.deepEqual(parseSrtContent(srt), [{start: "1.000", dur: "1.000", text: "Hello"}]);
  });

  it("joins multi-line text and strips HTML tags", () => {
    const srt = "1\n00:00:01,000 --> 00:00:02,000\n<i>Hello</i>\n<b>world</b>\n\n";
    assert.deepEqual(parseSrtContent(srt), [{start: "1.000", dur: "1.000", text: "Hello world"}]);
  });

  it("accepts dot millisecond separators", () => {
    const srt = "1\n00:00:01.000 --> 00:00:02.500\nText\n\n";
    assert.deepEqual(parseSrtContent(srt), [{start: "1.000", dur: "1.500", text: "Text"}]);
  });

  it("skips malformed blocks and empty text", () => {
    const srt = "1\nnot a timestamp\nText\n\n2\n00:00:01,000 --> 00:00:02,000\n\n\n3\n00:00:03,000 --> 00:00:04,000\nValid\n";
    assert.deepEqual(parseSrtContent(srt), [{start: "3.000", dur: "1.000", text: "Valid"}]);
  });

  it("returns [] for empty input", () => {
    assert.deepEqual(parseSrtContent(""), []);
  });
});

describe("parseAvailableLanguages", () => {
  it("extracts language codes from yt-dlp subtitle listing", () => {
    const output = [
      "Available subtitles for abc123:",
      "Language Name     Formats",
      "en      English   vtt, srt",
      "ja      Japanese  vtt, srt",
      "zh-Hans Chinese   vtt",
      "",
      "[info] Done",
    ].join("\n");
    const langs = parseAvailableLanguages(output);
    assert.ok(langs.includes("en"));
    assert.ok(langs.includes("ja"));
    assert.ok(langs.includes("zh-Hans"));
  });

  it("returns [] when no language section exists", () => {
    assert.deepEqual(parseAvailableLanguages("[info] nothing here\n"), []);
  });
});

describe("findBestLanguageMatch", () => {
  it("prefers exact matches", () => {
    assert.equal(findBestLanguageMatch("en", ["en", "en-US"]), "en");
  });

  it("falls back to regional variants", () => {
    assert.equal(findBestLanguageMatch("en", ["en-US", "ja"]), "en-US");
    assert.equal(findBestLanguageMatch("zh-TW", ["zh-Hant", "en"]), "zh-Hant");
  });

  it("matches partial base-language codes", () => {
    assert.equal(findBestLanguageMatch("pt", ["pt-BR"]), "pt-BR");
  });

  it("matches any Chinese variant for zh requests", () => {
    assert.equal(findBestLanguageMatch("zh", ["zh-Hans"]), "zh-Hans");
  });

  it("returns null when nothing matches", () => {
    assert.equal(findBestLanguageMatch("ko", ["en", "ja"]), null);
    assert.equal(findBestLanguageMatch("en", []), null);
  });
});
