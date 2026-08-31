import assert from "node:assert/strict";
import path from "node:path";
import {describe, it} from "node:test";
import {
  getLiveCaptionsBridgeCandidates,
  getLiveCaptionsBridgeExecutableName,
  getLiveCaptionsAppleLocale,
  isLiveCaptionsSupported
} from "../main/helpers/liveCaptionsSupport";

describe("isLiveCaptionsSupported", () => {
  it("is true on Windows", () => {
    assert.equal(isLiveCaptionsSupported({
      platform: "win32",
      arch: "x64",
      release: "10.0.22631"
    }), true);
  });

  it("is true on Apple Silicon macOS 26 (Darwin 25+)", () => {
    assert.equal(isLiveCaptionsSupported({
      platform: "darwin",
      arch: "arm64",
      release: "25.5.0"
    }), true);
  });

  it("is false on Intel Macs", () => {
    assert.equal(isLiveCaptionsSupported({
      platform: "darwin",
      arch: "x64",
      release: "25.5.0"
    }), false);
  });

  it("is false on macOS before Tahoe", () => {
    assert.equal(isLiveCaptionsSupported({
      platform: "darwin",
      arch: "arm64",
      release: "24.6.0"
    }), false);
  });

  it("is false on Linux", () => {
    assert.equal(isLiveCaptionsSupported({
      platform: "linux",
      arch: "x64",
      release: "6.8.0"
    }), false);
  });
});

describe("getLiveCaptionsBridgeCandidates", () => {
  it("looks in extraResources for a packaged Mac app", () => {
    const candidates = getLiveCaptionsBridgeCandidates({
      platform: "darwin",
      resourcesPath: "/App/Miteiru.app/Contents/Resources",
      cwd: "/tmp",
      appPath: "/App/Miteiru.app/Contents/Resources/app.asar"
    });

    assert.equal(getLiveCaptionsBridgeExecutableName("darwin"), "MiteiruLiveCaptionsBridge");
    assert.ok(candidates.includes(path.normalize(
      "/App/Miteiru.app/Contents/Resources/live-captions/MiteiruLiveCaptionsBridge"
    )));
  });

  it("looks in the repo resources folder for npm run dev", () => {
    const candidates = getLiveCaptionsBridgeCandidates({
      platform: "darwin",
      resourcesPath: "/Electron.app/Contents/Resources",
      cwd: "/Users/me/miteiru",
      appPath: "/Users/me/miteiru/app"
    });

    assert.ok(candidates.includes(path.normalize(
      "/Users/me/miteiru/resources/live-captions/MiteiruLiveCaptionsBridge"
    )));
    assert.ok(candidates.includes(path.normalize(
      "/Users/me/miteiru/native/live-captions/mac/MiteiruLiveCaptionsBridge"
    )));
  });
});

describe("getLiveCaptionsAppleLocale", () => {
  it("maps Japanese tokenizers to ja_JP", () => {
    assert.deepEqual(getLiveCaptionsAppleLocale("kuromoji"), {locale: "ja_JP", languageCode: "ja"});
    assert.deepEqual(getLiveCaptionsAppleLocale("mecab"), {locale: "ja_JP", languageCode: "ja"});
  });

  it("maps Mandarin and Cantonese", () => {
    assert.deepEqual(getLiveCaptionsAppleLocale("jieba"), {locale: "zh_CN", languageCode: "zh-CN"});
    assert.deepEqual(getLiveCaptionsAppleLocale("cantonese"), {locale: "yue_CN", languageCode: "yue"});
  });

  it("rejects Vietnamese and an unloaded tokenizer", () => {
    assert.equal(getLiveCaptionsAppleLocale("vietnamese").locale, undefined);
    assert.match(getLiveCaptionsAppleLocale("vietnamese").error ?? "", /does not support/);
    assert.match(getLiveCaptionsAppleLocale("").error ?? "", /home screen/);
  });
});
