import assert from "node:assert/strict";
import {test} from "node:test";
import {edlForStreams, youtubeStreamSource} from "../main/helpers/youtubeStream";

const headers = {"User-Agent": "Mozilla/5.0 (test)", Accept: "text/html,*/*;q=0.8"};

test("separate video and audio streams become one EDL with a track each", () => {
  // EDL's own separators (; , %) inside a URL are safe: each URL carries its byte length.
  const video = "https://rr1.googlevideo.com/videoplayback?id=1&sparams=a,b;c&sig=x%2Fy";
  const audio = "https://rr1.googlevideo.com/videoplayback?id=2&mime=audio%2Fwebm";
  const source = youtubeStreamSource({
    title: "見ている",
    requested_formats: [{url: video, http_headers: headers}, {url: audio, http_headers: headers}]
  });
  assert.equal(source.url,
    `edl://!no_clip;!no_chapters;%${video.length}%${video};!new_stream;!no_clip;!no_chapters;%${audio.length}%${audio}`);
  assert.deepEqual(source.headers, headers);
  assert.equal(source.title, "見ている");
  assert.equal(source.isLive, false);
});

test("a single file with both video and audio is one stream", () => {
  const url = "https://rr1.googlevideo.com/videoplayback?itag=18";
  const source = youtubeStreamSource({url, http_headers: headers, is_live: true});
  assert.equal(source.url, `edl://!no_clip;!no_chapters;%${url.length}%${url}`);
  assert.equal(source.isLive, true);
  assert.equal(source.title, "");
});

test("lengths are bytes, not characters", () => {
  // 10 ASCII bytes and a 2-byte é.
  assert.equal(edlForStreams(["https://x/é"]), "edl://!no_clip;!no_chapters;%12%https://x/é");
});

test("no playable stream is an error, not an empty EDL", () => {
  assert.throws(() => youtubeStreamSource({}), /no playable stream/);
  assert.throws(() => youtubeStreamSource({requested_formats: [{url: "https://a"}, {}]}), /no playable stream/);
  // Only http(s): yt-dlp's other "urls" (a local file, edl://) must not reach mpv.
  assert.throws(() => youtubeStreamSource({url: "file:///etc/passwd"}), /no playable stream/);
});

test("yt-dlp is asked for HLS first, then up to 1080p by the smaller side, H.264 first", async () => {
  const {YOUTUBE_STREAM_FORMAT_ARGS} = await import("../main/helpers/youtubeStream");
  const sort = YOUTUBE_STREAM_FORMAT_ARGS[YOUTUBE_STREAM_FORMAT_ARGS.indexOf("-S") + 1];
  // Segments keep every request small: whole-file URLs can refuse large or open-ended ranges (#135).
  assert.equal(sort.split(",")[0], "proto:m3u8_native");
  assert.match(sort, /res:1080/);
  assert.match(sort, /vcodec:h264/);
  assert.ok(YOUTUBE_STREAM_FORMAT_ARGS.includes("--ignore-no-formats-error"));
});
