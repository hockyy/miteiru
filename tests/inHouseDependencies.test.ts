import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {test} from "node:test";
import iconv from "iconv-lite";
import {decodeText} from "../main/helpers/textEncoding";
import {parseSubtitleCues} from "../main/helpers/subtitleParser";
import {resolveAppFile} from "../main/appProtocol";
import Japanese from "../main/handler/japanese";

const srt = (text: string) => `1\n00:00:01,000 --> 00:00:03,000\n${text}\n\n2\n00:00:04,000 --> 00:00:06,000\n${text}\n`;

test("decodeText reads legacy CJK encodings that the old detector returned null for", () => {
  const cases: [string, string][] = [
    ["shift_jis", "今日はいい天気ですね。駅前の喫茶店でコーヒーを飲みたい。"],
    ["euc-jp", "今日はいい天気ですね。駅前の喫茶店でコーヒーを飲みたい。"],
    ["gb18030", "今天天气真好啊。我想在车站前的咖啡店喝咖啡。"],
    ["big5", "今天天氣真好啊。我想在車站前的咖啡店喝咖啡。"],
    ["euc-kr", "오늘 날씨가 정말 좋네요. 역 앞 카페에서 커피를 마시고 싶어요."],
    ["windows-1252", "Café, déjà vu, à la fenêtre. C’est l’été."],
    ["windows-1250", "Příliš žluťoučký kůň úpěl ďábelské ódy."],
    ["windows-1251", "Привет, как дела? Это тест субтитров."],
  ];
  for (const [encoding, text] of cases) {
    const input = srt(text);
    assert.equal(decodeText(iconv.encode(input, encoding)).text, input, encoding);
  }
});

test("decodeText honours byte-order marks and BOM-less UTF-16", () => {
  const input = srt("字幕のテスト");
  assert.equal(decodeText(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(input)])).text, input);
  assert.equal(decodeText(iconv.encode(input, "utf-16le", {addBOM: true})).text, input);
  assert.equal(decodeText(iconv.encode(input, "utf-16be", {addBOM: true})).text, input);
  assert.equal(decodeText(iconv.encode(input, "utf-16le")).text, input);
  assert.equal(decodeText(Buffer.from(input)).encoding, "utf-8");
});

test("parseSubtitleCues reads ordinary SRT and WebVTT", () => {
  assert.deepEqual(parseSubtitleCues("1\n00:00:01,000 --> 00:00:02,500\nline one\nline two\n\n2\n00:00:03,000 --> 00:00:04,000\nthree\n"), [
    {id: "1", from: 1000, to: 2500, text: "line one\nline two"},
    {id: "2", from: 3000, to: 4000, text: "three"},
  ]);
  assert.deepEqual(parseSubtitleCues("WEBVTT\n\nNOTE a comment\n\nintro\n00:00:01.000 --> 00:00:02.000 align:start\n<v Bob>hello</v>\n"), [
    {id: "intro", from: 1000, to: 2000, text: "<v Bob>hello</v>"},
  ]);
});

test("parseSubtitleCues handles the inputs @plussub/srt-vtt-parser got wrong", () => {
  const first = (input: string) => parseSubtitleCues(input)[0];
  assert.deepEqual(first("1\n00:00:01.500 --> 00:00:02.000\nhello\n"), {id: "1", from: 1500, to: 2000, text: "hello"});
  assert.equal(first("1\n00:00:01,5 --> 00:00:02,000\nhello\n").from, 1500);
  assert.deepEqual(first("1\r\n00:00:01,000 --> 00:00:02,000\r\nhello\r\n\r\n"), {id: "1", from: 1000, to: 2000, text: "hello"});
  assert.deepEqual(first("WEBVTT\n\n00:01.000 --> 00:02.000 line:0\nhello\n"), {id: "", from: 1000, to: 2000, text: "hello"});
  assert.deepEqual(parseSubtitleCues("1\n00:00:01,000 --> 00:00:02,000\n\n2\n00:00:03,000 --> 00:00:04,000\nsecond\n").map((cue) => cue.text), ["", "second"]);
  assert.deepEqual(parseSubtitleCues("1\n00:00:01,000 --> 00:00:02,000\nhello\n\ngarbage\n").map((cue) => cue.text), ["hello"]);
  assert.deepEqual(parseSubtitleCues("1\n00:00:01,000 --> 00:00:02,000\nhello\n2\n00:00:03,000 --> 00:00:04,000\nworld\n"), [
    {id: "1", from: 1000, to: 2000, text: "hello"},
    {id: "", from: 3000, to: 4000, text: "world"},
  ]);
  assert.equal(first("1\n10:02:03,040 --> 10:02:04,000\nlate\n").from, ((10 * 60 + 2) * 60 + 3) * 1000 + 40);
});

test("resolveAppFile maps app:// URLs onto the exported renderer", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "miteiru-app-test-"));
  await fs.mkdir(path.join(directory, "home"));
  await fs.writeFile(path.join(directory, "home", "index.html"), "home");
  await fs.writeFile(path.join(directory, "index.html"), "root");
  await fs.writeFile(path.join(directory, "app.js"), "js");

  assert.equal(await resolveAppFile(directory, "app://./home/"), path.join(directory, "home", "index.html"));
  assert.equal(await resolveAppFile(directory, "app://./home"), path.join(directory, "home", "index.html"));
  assert.equal(await resolveAppFile(directory, "app://./app.js"), path.join(directory, "app.js"));
  assert.equal(await resolveAppFile(directory, "app://./missing.js"), null);
  assert.equal(await resolveAppFile(directory, "app://./unknown-page"), path.join(directory, "index.html"));
  assert.equal(await resolveAppFile(directory, "app://./%2e%2e/%2e%2e/secret.txt"), null);
  await fs.rm(directory, {recursive: true, force: true});
});

test("a failed Kuromoji dictionary load can be retried", async () => {
  Japanese.kuromojiDictPath = path.join(os.tmpdir(), "no-such-kuromoji-dict");
  await assert.rejects(Japanese.loadKuromojiTokenizer());

  Japanese.kuromojiDictPath = path.join(process.cwd(), "node_modules", "kuromoji", "dict");
  const tokenizer = await Japanese.loadKuromojiTokenizer();
  assert.equal(tokenizer.tokenizeForSentence("見た")[0].surface_form, "見");
});

test("decodeText keeps UTF-8 with a stray bad byte and reads ISO-2022-JP", () => {
  const french = srt("Café, déjà vu, à la fenêtre. C’est l’été.");
  const utf8 = Buffer.from(french);
  const corrupted = Buffer.concat([utf8.subarray(0, 40), Buffer.from([0xff]), utf8.subarray(40)]);
  const decoded = decodeText(corrupted);
  assert.equal(decoded.encoding, "utf-8");
  assert.ok(decoded.text.includes("déjà vu"));

  // 日本語の字幕 in ISO-2022-JP (JIS escape sequences), which iconv-lite cannot decode.
  const jis = Buffer.from([0x1b, 0x24, 0x42, 0x46, 0x7c, 0x4b, 0x5c, 0x38, 0x6c, 0x24, 0x4e, 0x3b, 0x7a, 0x4b, 0x6b, 0x1b, 0x28, 0x42]);
  const jisSubtitle = Buffer.concat(Array.from({length: 6}, () => Buffer.concat([Buffer.from("1\n00:00:01,000 --> 00:00:02,000\n"), jis, Buffer.from("\n\n")])));
  assert.ok(decodeText(jisSubtitle).text.includes("日本語の字幕"));
});

test("parseSubtitleCues keeps a cue whose only text is a number", () => {
  assert.deepEqual(parseSubtitleCues("00:00:01,000 --> 00:00:02,000\n42\n00:00:03,000 --> 00:00:04,000\nnext\n").map((cue) => cue.text), ["42", "next"]);
});
