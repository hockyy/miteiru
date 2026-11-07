import assert from "node:assert/strict";
import test from "node:test";
import {systemMediaToolPaths} from "../main/helpers/mediaToolPaths";

test("macOS searches PATH and both Homebrew prefixes for every optional tool", () => {
  for (const name of ["yt-dlp", "ffmpeg", "ffprobe"]) {
    assert.deepEqual(systemMediaToolPaths(name, "darwin"), [
      name, `/opt/homebrew/bin/${name}`, `/usr/local/bin/${name}`,
    ]);
  }
});

test("other platforms use PATH without macOS installation paths", () => {
  for (const platform of ["win32", "linux"] as const) {
    assert.deepEqual(systemMediaToolPaths("ffmpeg", platform), ["ffmpeg"]);
  }
});
