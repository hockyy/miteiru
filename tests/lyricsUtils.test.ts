import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
  findCachedYoutubeLyricsPath,
  legacyYoutubeLyricsFileName,
  lyricsQueryFromYoutubeTitle,
  lyricsSearchQuery,
  lyricsSearchQueryFromLocalPath,
  youtubeLyricsCandidateNames,
  youtubeLyricsFileName
} from "../renderer/utils/lyricsUtils";
import {parseYoutubeTitleOutput} from "../main/helpers/getSubtitles";

describe("youtube lyrics file names", () => {
  it("uses yt_{id}.lrc and keeps the legacy {id}.lrc as a fallback", () => {
    assert.equal(youtubeLyricsFileName("dQw4w9WgXcQ"), "yt_dQw4w9WgXcQ.lrc");
    assert.equal(legacyYoutubeLyricsFileName("dQw4w9WgXcQ"), "dQw4w9WgXcQ.lrc");
    assert.deepEqual(youtubeLyricsCandidateNames("dQw4w9WgXcQ"), [
      "yt_dQw4w9WgXcQ.lrc",
      "dQw4w9WgXcQ.lrc"
    ]);
  });
});

describe("lyricsSearchQuery", () => {
  it("prefers a cleaned YouTube title", () => {
    assert.equal(
      lyricsSearchQuery({
        videoPath: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        youtubeTitle: "Rick Astley - Never Gonna Give You Up (Official Music Video)"
      }),
      "Rick Astley - Never Gonna Give You Up"
    );
  });

  it("does not use the watch URL as a query while the title is unknown", () => {
    assert.equal(
      lyricsSearchQuery({videoPath: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}),
      ""
    );
  });

  it("falls back to a cleaned local filename", () => {
    assert.equal(
      lyricsSearchQueryFromLocalPath("C:\\Videos\\Artist - Song_1080p.mkv"),
      "Artist   Song"
    );
    assert.equal(
      lyricsSearchQuery({videoPath: "/home/user/Artist.Song.720p.mp4"}),
      "Artist Song"
    );
  });
});

describe("lyricsQueryFromYoutubeTitle", () => {
  it("strips common video-only suffixes", () => {
    assert.equal(
      lyricsQueryFromYoutubeTitle("Song Title [Official Audio]"),
      "Song Title"
    );
    assert.equal(
      lyricsQueryFromYoutubeTitle("Song Title (Lyrics)"),
      "Song Title"
    );
    assert.equal(
      lyricsQueryFromYoutubeTitle("Song Title【MV】"),
      "Song Title"
    );
  });
});

describe("parseYoutubeTitleOutput", () => {
  it("returns the first real title line", () => {
    assert.equal(parseYoutubeTitleOutput("Never Gonna Give You Up\n"), "Never Gonna Give You Up");
  });

  it("ignores NA, blanks, and log-style lines", () => {
    assert.equal(parseYoutubeTitleOutput("NA\n"), null);
    assert.equal(parseYoutubeTitleOutput(""), null);
    assert.equal(
      parseYoutubeTitleOutput("[youtube] Extracting URL\nActual Title\n"),
      "Actual Title"
    );
  });
});

describe("findCachedYoutubeLyricsPath", () => {
  const lyricsDir = "/userData/lyrics";
  const makeApi = (existing: string[]) => {
    const files = new Set(existing);
    return {
      getUserDataPath: async () => "/userData",
      joinPath: async (...parts: string[]) => parts.join("/"),
      checkFile: async (filePath: string) => files.has(filePath)
    };
  };

  it("prefers yt_{id}.lrc when both names exist", async () => {
    const api = makeApi([
      `${lyricsDir}/yt_dQw4w9WgXcQ.lrc`,
      `${lyricsDir}/dQw4w9WgXcQ.lrc`
    ]);
    assert.equal(
      await findCachedYoutubeLyricsPath("https://youtu.be/dQw4w9WgXcQ", api),
      `${lyricsDir}/yt_dQw4w9WgXcQ.lrc`
    );
  });

  it("falls back to the legacy {id}.lrc name", async () => {
    const api = makeApi([`${lyricsDir}/dQw4w9WgXcQ.lrc`]);
    assert.equal(
      await findCachedYoutubeLyricsPath("https://www.youtube.com/watch?v=dQw4w9WgXcQ", api),
      `${lyricsDir}/dQw4w9WgXcQ.lrc`
    );
  });

  it("returns null when no cached lyrics exist", async () => {
    assert.equal(
      await findCachedYoutubeLyricsPath("https://youtu.be/dQw4w9WgXcQ", makeApi([])),
      null
    );
  });

  it("returns null for non-YouTube paths", async () => {
    assert.equal(
      await findCachedYoutubeLyricsPath("/home/user/movie.mkv", makeApi([])),
      null
    );
  });
});
