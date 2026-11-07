import assert from "node:assert/strict";
import test from "node:test";
import {systemMediaToolPaths, ytDlpDownloadLink} from "../main/helpers/mediaToolPaths";

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

test("yt-dlp's link is the Windows build only on Windows", () => {
  assert.match(ytDlpDownloadLink("win32"), /yt-dlp.exe$/);
  assert.equal(ytDlpDownloadLink("darwin"), "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos");
  assert.equal(ytDlpDownloadLink("linux"), "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux");
});
