import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
  classifySubtitleTag,
  routeSubtitlesBesideVideo,
  subtitleTagBesideVideo
} from "../renderer/utils/subtitleTags";

const video = "C:\\anime\\show.mkv";
const beside = (...names: string[]) => names.map((name) => `C:\\anime\\${name}`);

describe("subtitleTagBesideVideo", () => {
  it("reads the tag between the video's name and the extension", () => {
    assert.equal(subtitleTagBesideVideo(video, "C:\\anime\\show.srt"), "");
    assert.equal(subtitleTagBesideVideo(video, "C:\\anime\\show.ja.srt"), "ja");
    assert.equal(subtitleTagBesideVideo(video, "C:\\anime\\show.zh-Hans.ass"), "zh-Hans");
    assert.equal(subtitleTagBesideVideo("/v/Show.mkv", "/v/show.EN.srt"), "EN");
  });

  it("ignores files that are not named after the video", () => {
    assert.equal(subtitleTagBesideVideo(video, "C:\\anime\\show2.srt"), null);
    assert.equal(subtitleTagBesideVideo(video, "C:\\anime\\other.ja.srt"), null);
    assert.equal(subtitleTagBesideVideo(video, "C:\\anime\\show.ja.forced.srt"), null);
  });
});

describe("classifySubtitleTag", () => {
  it("knows each learning language's tags", () => {
    for (const tag of ["ja", "jpn", "jp", "JA"]) assert.equal(classifySubtitleTag(tag, "ja"), "learning", tag);
    for (const tag of ["zh", "chs", "cht", "zh-Hans", "zh-Hant", "zh-CN", "zh-TW", "zh_cn"]) {
      assert.equal(classifySubtitleTag(tag, "zh-CN"), "learning", tag);
    }
    for (const tag of ["yue", "zh-HK"]) assert.equal(classifySubtitleTag(tag, "yue"), "learning", tag);
    for (const tag of ["vi", "vie"]) assert.equal(classifySubtitleTag(tag, "vi"), "learning", tag);
  });

  it("sends English to the translation and everything else out", () => {
    assert.equal(classifySubtitleTag("en", "ja"), "translation");
    assert.equal(classifySubtitleTag("eng", "ja"), "translation");
    assert.equal(classifySubtitleTag("fr", "ja"), "other");
    assert.equal(classifySubtitleTag("ja", "vi"), "other");
    assert.equal(classifySubtitleTag("zh-HK", "zh-CN"), "other");
  });
});

describe("routeSubtitlesBesideVideo", () => {
  it("puts the learning language on top and English underneath, leaving other languages out", () => {
    const routed = routeSubtitlesBesideVideo(video, beside("show.en.srt", "show.fr.srt", "show.ja.srt", "show.de.ass"), "ja");
    assert.deepEqual(routed, [
      {path: "C:\\anime\\show.ja.srt", target: "primary"},
      {path: "C:\\anime\\show.en.srt", target: "secondary"}
    ]);
  });

  it("prefers the exact language tag over a looser one, and any tag over an untagged file", () => {
    assert.deepEqual(routeSubtitlesBesideVideo(video, beside("show.jpn.ass", "show.ja.srt", "show.srt"), "ja"), [
      {path: "C:\\anime\\show.ja.srt", target: "primary"}
    ]);
    assert.deepEqual(routeSubtitlesBesideVideo(video, beside("show.cht.srt", "show.zh-Hans.srt", "show.srt"), "zh-CN"), [
      {path: "C:\\anime\\show.zh-Hans.srt", target: "primary"}
    ]);
  });

  it("keeps show.srt and show.en.srt working as before: untagged is asked, English goes to the translation", () => {
    assert.deepEqual(routeSubtitlesBesideVideo(video, beside("show.srt", "show.en.srt"), "ja"), [
      {path: "C:\\anime\\show.en.srt", target: "secondary"},
      {path: "C:\\anime\\show.srt"}
    ]);
    assert.deepEqual(routeSubtitlesBesideVideo(video, beside("show.srt"), "ja"), [{path: "C:\\anime\\show.srt"}]);
  });

  it("loads nothing when only other languages are there", () => {
    assert.deepEqual(routeSubtitlesBesideVideo(video, beside("show.fr.srt", "show.ko.ass"), "ja"), []);
    assert.deepEqual(routeSubtitlesBesideVideo(video, [], "ja"), []);
  });

  it("ignores subtitles of other videos in the folder", () => {
    assert.deepEqual(routeSubtitlesBesideVideo(video, beside("show2.ja.srt", "other.ja.srt"), "ja"), []);
  });
});
