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

  it("clamps end to the file size", () => {
    assert.deepEqual(parseRangeHeader("bytes=10-9999", 1000), {start: 10, end: 999});
  });

  it("rejects invalid ranges", () => {
    assert.equal(parseRangeHeader("bytes=20-10", 1000), null); // start > end
    assert.equal(parseRangeHeader("bytes=1000-", 1000), null); // start beyond EOF
    assert.equal(parseRangeHeader("bytes=-0", 1000), null); // zero-length suffix
    assert.equal(parseRangeHeader("items=1-2", 1000), null); // wrong unit
    assert.equal(parseRangeHeader("garbage", 1000), null);
  });

  it("rejects ranges for empty files", () => {
    assert.equal(parseRangeHeader("bytes=0-", 0), null);
    assert.equal(parseRangeHeader("bytes=-500", 0), null);
  });
});
