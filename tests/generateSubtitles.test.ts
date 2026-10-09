import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
  asrLanguageForAppLang,
  DEFAULT_ASR_MODEL,
  isKnownAsrModel,
  shouldConvertToTraditional,
  subtitleFileTagForAppLang
} from "../renderer/utils/generateSubtitlesConfig";
import {extractJsonArray} from "../renderer/utils/parseJsonResponse";
import {parseCueTranslations} from "../main/helpers/translateSrt";
import {normalizeLocalMediaPath} from "../main/helpers/localMediaPath";

describe("generateSubtitlesConfig", () => {
  it("keeps Qwen 1.7B as the default timestamped ASR model", () => {
    assert.equal(DEFAULT_ASR_MODEL, "qwen/qwen3-asr-1.7b");
    assert.equal(isKnownAsrModel(DEFAULT_ASR_MODEL), true);
    assert.equal(isKnownAsrModel("qwen/qwen3-asr-flash-2026-02-10"), false);
  });

  it("maps app languages to ASR codes and filename tags", () => {
    assert.equal(asrLanguageForAppLang("yue"), "yue");
    assert.equal(asrLanguageForAppLang("zh-CN"), "zh");
    assert.equal(subtitleFileTagForAppLang("yue"), "yue");
    assert.equal(subtitleFileTagForAppLang("ja"), "ja");
    assert.equal(shouldConvertToTraditional("yue"), true);
    assert.equal(shouldConvertToTraditional("ja"), false);
  });
});

describe("extractJsonArray", () => {
  it("reads fenced and raw JSON arrays", () => {
    assert.equal(extractJsonArray('```json\n[{"i":1,"en":"hi"}]\n```'), '[{"i":1,"en":"hi"}]');
    assert.equal(extractJsonArray('prefix [{"i":2,"en":"ok"}] suffix'), '[{"i":2,"en":"ok"}]');
    assert.equal(extractJsonArray("nope"), null);
  });
});

describe("parseCueTranslations", () => {
  it("maps numbered cue translations", () => {
    const got = parseCueTranslations('[{"i":1,"en":"Hello"},{"i":2,"en":"World"}]');
    assert.equal(got.get(1), "Hello");
    assert.equal(got.get(2), "World");
  });
});

describe("normalizeLocalMediaPath", () => {
  it("leaves http URLs unchanged", () => {
    assert.equal(
      normalizeLocalMediaPath("https://www.youtube.com/watch?v=abc"),
      "https://www.youtube.com/watch?v=abc"
    );
  });

  it("strips the leading slash on Windows drive paths", () => {
    if (process.platform !== "win32") {
      return;
    }
    assert.equal(normalizeLocalMediaPath("/C:/Videos/clip.mp4"), "C:\\Videos\\clip.mp4");
  });
});
