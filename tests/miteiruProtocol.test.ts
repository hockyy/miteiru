import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {parseRangeHeader, resolveMiteiruFilePath} from "../main/miteiruProtocol";

describe("miteiru protocol", () => {
  it("resolves encoded Windows drive URLs", () => {
    const resolved = resolveMiteiruFilePath(
      "miteiru:///C%3A/Users/miki/Videos/sample.mkv",
    );
    assert.match(resolved, /[\\/]Users[\\/]miki[\\/]Videos[\\/]sample\.mkv$/);
  });

  it("recovers mangled Windows host URLs", () => {
    const resolved = resolveMiteiruFilePath("miteiru://C/Users/miki/Videos/sample.mkv");
    assert.match(resolved, /[\\/]Users[\\/]miki[\\/]Videos[\\/]sample\.mkv$/);
  });

  it("parses open-ended byte ranges", () => {
    const range = parseRangeHeader("bytes=0-", 1000);
    assert.deepEqual(range, {start: 0, end: 999});
  });

  it("parses suffix byte ranges", () => {
    const range = parseRangeHeader("bytes=-500", 1000);
    assert.deepEqual(range, {start: 500, end: 999});
  });

  it("parses bounded byte ranges", () => {
    const range = parseRangeHeader("bytes=10-20", 1000);
    assert.deepEqual(range, {start: 10, end: 20});
  });
});
