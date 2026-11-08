import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
  downloadBytes,
  downloadedBytes,
  formatProgressSize,
  formatSize,
  friendlyPackError,
  installedMessage,
  isLanguageAvailable,
  languageReadyMessage,
  missingPacks,
  packsForLanguage,
  packStateLabel,
  progressFraction,
  recoveredInstallLanguage,
  type LanguagePack,
  type LanguagePackStatus,
  type PackState,
} from "../renderer/utils/languagePacks";

const MB = 1024 * 1024;

const pack = (id: string, languages: string[], state: PackState, bytes = 10 * MB): LanguagePack => ({
  id, title: id, file: `${id}.mtrpack`, bytes, sha256: "00", plugins: [id], languages, state, dir: null, installedSha256: null,
});

const status = (packs: LanguagePack[], manifestFound = true): LanguagePackStatus => ({
  manifestFound, root: "C:/packs", baseUrl: "https://example.test/", appVersion: "8.0.0", packs, running: [],
});

const packs = [
  pack("japanese", ["japanese-kuromoji"], "missing", 33 * MB),
  pack("hanzi", ["mandarin-jieba", "cantonese-jieba"], "missing", 5 * MB),
  pack("mandarin", ["mandarin-jieba"], "installed", 19 * MB),
  pack("cantonese", ["cantonese-jieba"], "outdated", 14 * MB),
  pack("vietnamese", ["vietnamese"], "bundled", 0.6 * MB),
];

describe("which packs a language needs", () => {
  it("collects every pack that serves the plugin, including shared ones", () => {
    assert.deepEqual(packsForLanguage(status(packs), "mandarin-jieba").map((p) => p.id), ["hanzi", "mandarin"]);
    assert.deepEqual(packsForLanguage(status(packs), "japanese-kuromoji").map((p) => p.id), ["japanese"]);
    assert.deepEqual(packsForLanguage(status(packs), "nothing"), []);
    assert.deepEqual(packsForLanguage(null, "vietnamese"), []);
  });

  it("counts only missing packs; outdated still works", () => {
    assert.deepEqual(missingPacks(status(packs), "mandarin-jieba").map((p) => p.id), ["hanzi"]);
    assert.deepEqual(missingPacks(status(packs), "cantonese-jieba").map((p) => p.id), ["hanzi"]);
    assert.deepEqual(missingPacks(status(packs), "vietnamese"), []);
    assert.deepEqual(missingPacks(null, "japanese-kuromoji"), []);
  });

  it("treats a language as available without a manifest, without status, or with nothing missing", () => {
    assert.equal(isLanguageAvailable(null, "japanese-kuromoji"), true);
    assert.equal(isLanguageAvailable(undefined, "japanese-kuromoji"), true);
    assert.equal(isLanguageAvailable(status(packs, false), "japanese-kuromoji"), true);
    assert.equal(isLanguageAvailable(status(packs), "japanese-kuromoji"), false);
    assert.equal(isLanguageAvailable(status(packs), "vietnamese"), true);
    assert.equal(isLanguageAvailable(status([pack("cantonese", ["cantonese-jieba"], "outdated")]), "cantonese-jieba"), true);
  });

  it("sums download bytes", () => {
    assert.equal(downloadBytes([]), 0);
    assert.equal(downloadBytes(missingPacks(status(packs), "japanese-kuromoji")), 33 * MB);
    assert.equal(downloadBytes([{bytes: 1}, {bytes: 2}, {bytes: Number.NaN}]), 3);
  });

  it("labels the states", () => {
    assert.equal(packStateLabel("bundled"), "Built in");
    assert.equal(packStateLabel("installed"), "Installed");
    assert.equal(packStateLabel("outdated"), "Update available");
    assert.equal(packStateLabel("missing"), "Not downloaded");
  });
});

describe("formatSize", () => {
  it("rounds whole megabytes from 10 MB up and uses one decimal below", () => {
    assert.equal(formatSize(33 * MB), "33 MB");
    assert.equal(formatSize(32.6 * MB), "33 MB");
    assert.equal(formatSize(10 * MB), "10 MB");
    assert.equal(formatSize(0.6 * MB), "0.6 MB");
    assert.equal(formatSize(9.96 * MB), "10.0 MB");
    assert.equal(formatSize(2.5 * MB), "2.5 MB");
  });

  it("switches to gigabytes and survives bad input", () => {
    assert.equal(formatSize(1.2 * 1024 * MB), "1.2 GB");
    assert.equal(formatSize(0), "0.0 MB");
    assert.equal(formatSize(-5), "0.0 MB");
    assert.equal(formatSize(Number.NaN), "0.0 MB");
  });

  it("formats progress as the amount so far then the total", () => {
    assert.equal(formatProgressSize(12.3 * MB, 33 * MB), "12.3 of 33 MB");
    assert.equal(formatProgressSize(40 * MB, 33 * MB), "33.0 of 33 MB");
    assert.equal(formatProgressSize(0, 0.6 * MB), "0.0 of 0.6 MB");
  });
});

describe("progressFraction", () => {
  const two = [{bytes: 75}, {bytes: 25}];

  it("is 0 before any report and for no packs", () => {
    assert.equal(progressFraction(null, two, 0), 0);
    assert.equal(progressFraction(undefined, two, 0), 0);
    assert.equal(progressFraction(null, [], 0), 0);
  });

  it("weights one pack's download as most of its share, then verify and install", () => {
    const one = [{bytes: 100}];
    assert.equal(progressFraction({id: "a", phase: "download", done: 50, total: 100}, one, 0), 0.45);
    assert.equal(progressFraction({id: "a", phase: "download", done: 100, total: 100}, one, 0), 0.9);
    assert.ok(Math.abs(progressFraction({id: "a", phase: "verify", done: 100, total: 100}, one, 0) - 0.95) < 1e-9);
    assert.equal(progressFraction({id: "a", phase: "install", done: 0, total: 10}, one, 0), 0.95);
    assert.ok(Math.abs(progressFraction({id: "a", phase: "install", done: 5, total: 10}, one, 0) - 0.975) < 1e-9);
    assert.equal(progressFraction({id: "a", phase: "install", done: 10, total: 10}, one, 0), 1);
  });

  it("counts earlier packs as done, weighted by bytes", () => {
    // pack 0 (75 bytes) finished: 75 of 100.
    assert.equal(progressFraction(null, two, 1), 0.75);
    // pack 1 half downloaded: 75 + 25 * 0.45 = 86.25 of 100.
    assert.equal(progressFraction({id: "b", phase: "download", done: 5, total: 10}, two, 1), 0.8625);
    // pack 0 half downloaded: 75 * 0.45 = 33.75 of 100.
    assert.equal(progressFraction({id: "a", phase: "download", done: 5, total: 10}, two, 0), 0.3375);
  });

  it("a small pack barely moves the bar next to a large one", () => {
    const sizes = [{bytes: 33 * MB}, {bytes: 0.6 * MB}];
    const afterBig = progressFraction(null, sizes, 1);
    assert.ok(afterBig > 0.98 && afterBig < 1);
  });

  it("never goes backwards across a sequence and stays within 0 to 1", () => {
    const sequence = [{bytes: 40}, {bytes: 10}, {bytes: 50}];
    let last = 0;
    for (let index = 0; index < sequence.length; index++) {
      for (const phase of ["download", "verify", "install"] as const) {
        for (const done of [0, 3, 7, 10]) {
          const value = progressFraction({id: String(index), phase, done, total: 10}, sequence, index);
          assert.ok(value >= last - 1e-12, `${index} ${phase} ${done}: ${value} < ${last}`);
          assert.ok(value >= 0 && value <= 1);
          last = value;
        }
      }
    }
    assert.ok(Math.abs(last - 1) < 1e-9);
  });

  it("clamps odd reports and handles unknown sizes", () => {
    assert.equal(progressFraction({id: "a", phase: "download", done: 500, total: 100}, [{bytes: 100}], 0), 0.9);
    assert.equal(progressFraction({id: "a", phase: "download", done: 5, total: 0}, [{bytes: 100}], 0), 0);
    assert.equal(progressFraction(null, [{bytes: 100}], 9), 0);
    assert.equal(progressFraction({id: "a", phase: "download", done: 5, total: 10}, [{bytes: 0}, {bytes: 0}], 1), 0.725);
  });

  it("reports downloaded bytes across the sequence", () => {
    assert.equal(downloadedBytes(null, two, 0), 0);
    assert.equal(downloadedBytes(null, two, 1), 75);
    assert.equal(downloadedBytes({id: "b", phase: "download", done: 5, total: 10}, two, 1), 87.5);
    assert.equal(downloadedBytes({id: "b", phase: "install", done: 1, total: 10}, two, 1), 100);
    assert.equal(downloadedBytes(null, [], 0), 0);
  });
});

describe("friendlyPackError", () => {
  it("says it could not reach GitHub on network errors", () => {
    const error = friendlyPackError("ENETWORK: connection reset", "Japanese");
    assert.equal(error?.message, "Couldn't reach GitHub to download Japanese. Check the connection, then try again, or install it from a file.");
    assert.equal(error?.details, "ENETWORK: connection reset");
  });

  it("explains a 404 as downloads not on GitHub yet, and other statuses with the code", () => {
    assert.equal(friendlyPackError("EHTTP 404: Not Found", "Japanese")?.message,
      "This version's language downloads aren't on GitHub (yet). Install from a file, or try a released version.");
    assert.equal(friendlyPackError("EHTTP 503: unavailable", "Cantonese")?.message,
      "GitHub answered with an error (503) while downloading Cantonese. Try again in a little while.");
  });

  it("calls checksum and size mismatches a damaged download", () => {
    for (const code of ["ECHECKSUM: sha256 differs", "ESIZE: expected 10 got 9"]) {
      assert.equal(friendlyPackError(code, "Japanese")?.message, "The download was damaged on the way. Try again.");
    }
  });

  it("names the pack and the version for a pack of a different version", () => {
    const rust = (id: string) => `EVERSION: old.mtrpack is the ${id} language pack, but not the version Miteiru 8.0.1 expects; download the matching one.`;
    assert.equal(friendlyPackError(rust("japanese"), "Chinese", "8.0.1")?.message,
      "That file is the Japanese pack for a different version of Miteiru. Download the one for v8.0.1 from its release page.");
    assert.equal(friendlyPackError(rust("hanzi"), "x", "v8.0.1")?.message,
      "That file is the Chinese character strokes pack for a different version of Miteiru. Download the one for v8.0.1 from its release page.");
    assert.equal(friendlyPackError("EVERSION: ", "Japanese")?.message,
      "That file is the Japanese pack for a different version of Miteiru. Download the one for this version from its release page.");
  });

  it("says a bad file is not a language pack", () => {
    assert.equal(friendlyPackError("EBADPACK: no header", "Japanese")?.message, "That file isn't a Miteiru language pack.");
  });

  it("shows nothing when cancelled", () => {
    assert.equal(friendlyPackError("ECANCELED: cancelled", "Japanese"), null);
    assert.equal(friendlyPackError("ECANCELED", "Japanese"), null);
  });

  it("includes the disk detail for I/O errors", () => {
    assert.equal(friendlyPackError("EIO: C:\\packs\\a.part: disk full", "Japanese")?.message,
      "Couldn't save the download: C:\\packs\\a.part: disk full.");
    assert.equal(friendlyPackError("EIO: out of space.", "Japanese")?.message, "Couldn't save the download: out of space.");
    assert.equal(friendlyPackError("EIO", "Japanese")?.message, "Couldn't save the download.");
  });

  it("falls back to a generic sentence and keeps the raw text", () => {
    const unknown = friendlyPackError("EWHATEVER: strange", "Japanese");
    assert.equal(unknown?.message, "Couldn't install Japanese.");
    assert.equal(unknown?.details, "EWHATEVER: strange");
    assert.equal(friendlyPackError("something exploded", "Vietnamese")?.message, "Couldn't install Vietnamese.");
    assert.equal(friendlyPackError("something exploded", "Vietnamese")?.details, "something exploded");
    assert.equal(friendlyPackError("ENOMANIFEST: none", "Japanese")?.message, "Couldn't install Japanese.");
    assert.equal(friendlyPackError("", "Japanese")?.details, null);
  });

  it("says a pack that is already downloading is already downloading", () => {
    assert.equal(friendlyPackError("EBUSY: japanese", "Japanese")?.message, "Japanese is already downloading.");
  });
});

describe("what to say after a pack is installed", () => {
  const titled = (id: string, languages: string[], state: PackState) => ({...pack(id, languages, state), title: `${id} pack`});

  it("names the languages that are now complete", () => {
    const after = status([titled("hanzi", ["mandarin-jieba", "cantonese-jieba"], "installed"), titled("mandarin", ["mandarin-jieba"], "installed"),
      titled("cantonese", ["cantonese-jieba"], "installed")]);
    assert.equal(installedMessage(after, {id: "cantonese", title: "x"}), "Cantonese is ready.");
    assert.equal(installedMessage(after, {id: "hanzi", title: "x"}), "Chinese and Cantonese are ready.");
  });

  it("says what a language still lacks", () => {
    const after = status([titled("hanzi", ["mandarin-jieba", "cantonese-jieba"], "installed"), titled("mandarin", ["mandarin-jieba"], "installed"),
      titled("cantonese", ["cantonese-jieba"], "missing")]);
    assert.equal(installedMessage(after, {id: "hanzi", title: "x"}),
      "Installed hanzi pack. Chinese is ready. Cantonese also needs cantonese pack.");
    const none = status([titled("hanzi", ["mandarin-jieba"], "installed"), titled("mandarin", ["mandarin-jieba"], "missing")]);
    assert.equal(installedMessage(none, {id: "hanzi", title: "x"}), "Installed hanzi pack. Chinese also needs mandarin pack.");
  });

  it("falls back to the pack title when no language uses it", () => {
    assert.equal(installedMessage(null, {id: "x", title: "Extra"}), "Extra is ready.");
  });

  it("reports a language as ready or what it still needs", () => {
    const after = status([titled("hanzi", ["mandarin-jieba"], "installed"), titled("mandarin", ["mandarin-jieba"], "missing")]);
    assert.equal(languageReadyMessage(after, "mandarin-jieba", "Chinese"), "Chinese still needs mandarin pack.");
    assert.equal(languageReadyMessage(status(packs), "vietnamese", "Vietnamese"), "Vietnamese is ready.");
  });
});

describe("recoveredInstallLanguage", () => {
  const hanzi = pack("hanzi", ["mandarin-jieba", "cantonese-jieba"], "missing");
  it("prefers the language picked on Home when the pack serves it", () => {
    assert.equal(recoveredInstallLanguage(hanzi, "cantonese-jieba"), "cantonese-jieba");
  });
  it("falls back to the first language otherwise", () => {
    assert.equal(recoveredInstallLanguage(hanzi, "japanese-kuromoji"), "mandarin-jieba");
    assert.equal(recoveredInstallLanguage(hanzi, null), "mandarin-jieba");
  });
  it("is null without a pack", () => {
    assert.equal(recoveredInstallLanguage(undefined, "cantonese-jieba"), null);
  });
});
