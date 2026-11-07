import assert from "node:assert/strict";
import {afterEach, describe, it} from "node:test";
import {
  droppedWebLink,
  loadMediaPaths,
  looksLikeWebLink,
  NOT_YOUTUBE_LINK_MESSAGE,
  unsupportedFileMessage
} from "../renderer/utils/mediaUtils";
import {isVideo} from "../renderer/utils/utils";
import {
  NOT_PROGRESS_FILE_MESSAGE,
  parseProgressFile,
  parseStyleFile,
  progressImportedMessage
} from "../renderer/utils/importFiles";
import {
  analysisFailureMessage,
  capabilityRows,
  ffmpegSetupHint,
  isMissingYtDlpError,
  ytDlpSetupSteps
} from "../renderer/utils/toolSetup";
import {languageSetupFailure} from "../renderer/utils/languageErrors";

const globalWithWindow = globalThis as unknown as { window?: unknown };
afterEach(() => {
  delete globalWithWindow.window;
});

describe("unsupported files and links", () => {
  it("names the extension and what does open", () => {
    assert.equal(
      unsupportedFileMessage("C:\\Videos\\clip.xyz"),
      "Miteiru can't open \".xyz\" files. Videos: mp4, mkv, webm…; subtitles: srt, ass, vtt, lrc."
    );
    assert.match(unsupportedFileMessage("/home/me/notes.NFO"), /"\.nfo" files/);
    assert.match(unsupportedFileMessage("/home/me/README"), /"README"/);
  });

  it("explains other sites' links", () => {
    assert.equal(NOT_YOUTUBE_LINK_MESSAGE, "Only YouTube links open directly. For other sites, download the video first.");
    assert.equal(looksLikeWebLink("https://vimeo.com/123"), true);
    assert.equal(looksLikeWebLink("hello world"), false);
    assert.equal(looksLikeWebLink("https://a.com and more"), false);
    assert.equal(droppedWebLink({getData: (type) => (type === "text/uri-list" ? "# c\r\nhttps://vimeo.com/1" : "")}), "https://vimeo.com/1");
    assert.equal(droppedWebLink({getData: () => ""}), undefined);
  });

  it("opens the container formats libmpv plays", () => {
    for (const name of ["a.m4v", "a.mov", "a.avi", "a.wmv", "a.flv", "a.ts", "a.m2ts", "a.mts", "a.mpg", "a.mpeg", "a.ogv",
      "a.m4a", "a.mp3", "a.flac", "a.opus", "a.ogg", "a.wav", "a.MKV"]) {
      assert.equal(isVideo(name), true, name);
    }
    assert.equal(isVideo("a.xyz"), false);
  });

  it("a drop of a video with an unrelated file ignores the extra; a drop of only unknown files reaches the loader", async () => {
    globalWithWindow.window = {electronAPI: {checkSubtitleFile: async () => []}};
    const calls: unknown[] = [];
    await loadMediaPaths(["C:\\v\\ep.mkv", "C:\\v\\ep.nfo"], (files) => calls.push(files));
    assert.deepEqual(calls, [[{path: "C:\\v\\ep.mkv"}]]);
    calls.length = 0;
    await loadMediaPaths(["C:\\v\\clip.xyz"], (files) => calls.push(files));
    assert.deepEqual(calls, [[{path: "C:\\v\\clip.xyz"}]]);
  });

  it("routes subtitles beside a video by their language tag when the language is known", async () => {
    globalWithWindow.window = {
      electronAPI: {
        checkSubtitleFile: async () => ["C:\\v\\ep.en.srt", "C:\\v\\ep.fr.srt", "C:\\v\\ep.ja.ass", "C:\\v\\ep.srt"]
      }
    };
    const calls: unknown[] = [];
    await loadMediaPaths(["C:\\v\\ep.mkv"], (files) => calls.push(files), "ja");
    assert.deepEqual(calls, [
      [{path: "C:\\v\\ep.mkv"}],
      [{path: "C:\\v\\ep.ja.ass", target: "primary"}],
      [{path: "C:\\v\\ep.en.srt", target: "secondary"}]
    ]);
  });
});

describe("imports", () => {
  it("counts the words in a progress file", () => {
    const file = JSON.stringify({猫: {level: 2, updTime: 5}, 犬: {level: 1, updTime: 6}, 旧: 3});
    const parsed = parseProgressFile(file);
    assert.equal(parsed.kind, "ok");
    assert.equal(parsed.kind === "ok" && parsed.count, 3);
    assert.equal(progressImportedMessage(132), "Loaded 132 words");
    assert.equal(progressImportedMessage(1), "Loaded 1 word");
  });

  it("refuses a file that is not a progress file, and treats a closed picker as nothing", () => {
    assert.equal(NOT_PROGRESS_FILE_MESSAGE, "That file isn't a Miteiru progress file");
    assert.equal(parseProgressFile("").kind, "cancelled");
    for (const text of ["not json", "[1,2]", "42", "null", JSON.stringify({text: {color: "#fff"}, background: "#000"})]) {
      assert.equal(parseProgressFile(text).kind, "invalid", text);
    }
  });

  it("accepts a style file with its text and outline settings and fills in the rest", () => {
    const defaults = {text: {color: "#fff"}, stroke: {width: "0px"}, position: "5vh"};
    const ok = parseStyleFile(JSON.stringify({text: {color: "#000"}, stroke: {width: "1px"}}), defaults);
    assert.equal(ok.kind, "ok");
    assert.deepEqual(ok.kind === "ok" && ok.style.position, "5vh");
    assert.equal(parseStyleFile(JSON.stringify({猫: {level: 1}}), defaults).kind, "invalid");
    assert.equal(parseStyleFile("", defaults).kind, "cancelled");
  });
});

describe("tool messages", () => {
  it("tells a missing ffprobe from a bad file", () => {
    assert.match(analysisFailureMessage("FFprobe not found. Please install FFmpeg and make sure it's in your PATH."), /Some files need FFmpeg.*Home → Settings & tools/);
    assert.ok(!/FFmpeg/.test(analysisFailureMessage("ffprobe failed: Invalid data found")));
  });

  it("recognises the missing yt-dlp error", () => {
    assert.equal(isMissingYtDlpError("yt-dlp was not found. Put yt-dlp.exe in C:\\tools or on your PATH."), true);
    assert.equal(isMissingYtDlpError("HTTP 429"), false);
    assert.equal(isMissingYtDlpError(null), false);
  });

  it("gives each OS its own steps", () => {
    assert.match(ytDlpSetupSteps("win32").join(" "), /yt-dlp\.exe.*tools folder/);
    assert.match(ytDlpSetupSteps("darwin").join(" "), /brew install yt-dlp/);
    assert.match(ytDlpSetupSteps("darwin").join(" "), /yt-dlp_macos/);
    assert.match(ytDlpSetupSteps("linux").join(" "), /package manager/);
    assert.match(ytDlpSetupSteps("linux").join(" "), /yt-dlp_linux/);
    assert.match(ffmpegSetupHint("darwin"), /brew install ffmpeg/);
  });

  it("makes one row per capability", () => {
    const rows = capabilityRows({"yt-dlp": {available: true}, ffmpeg: {available: true}, ffprobe: {available: false}});
    assert.deepEqual(rows.map((row) => [row.title, row.needs, row.found]), [
      ["YouTube captions", "needs yt-dlp", true],
      ["Subtitles inside some video files", "needs FFmpeg", false]
    ]);
    assert.equal(capabilityRows(undefined).every((row) => !row.found), true);
  });

  it("wraps a language set-up failure, keeping the reason", () => {
    assert.deepEqual(languageSetupFailure("Japanese", "ENOENT: no such file"), {
      message: "Couldn't set up Japanese. Try again; if it keeps failing, restart Miteiru.",
      details: "ENOENT: no such file"
    });
    assert.equal(languageSetupFailure("Japanese").details, null);
  });
});
