import assert from "node:assert/strict";
import {test} from "node:test";
import {youtubeCaptionSource} from "../main/helpers/youtubeCaptions";
import {downloadYoutubeCaption} from "../main/helpers/youtubeCaptionDownload";

const url = "https://www.youtube.com/api/timedtext?v=test&lang=ja";
const longCaption = "WEBVTT\n\n05:00:01.000 --> 05:00:03.000\nこんにちは\n";

test("caption sources use the exact selected manual track and preserve request headers", () => {
  const source = youtubeCaptionSource({
    http_headers: {"User-Agent": "Miteiru", Accept: "*/*"},
    subtitles: {ja: [
      {ext: "srt", url: `${url}&fmt=srt`},
      {ext: "vtt", url, http_headers: {Accept: "text/vtt"}}
    ]},
    automatic_captions: {ja: [{ext: "vtt", url: "https://example.com/duplicate.m3u8"}]}
  }, "ja");
  assert.deepEqual(source, {url, ext: "vtt", headers: {"User-Agent": "Miteiru", Accept: "text/vtt"}});
  assert.equal(youtubeCaptionSource({subtitles: {"en-US": [{ext: "vtt", url}]}}, "en"), null);
});

test("automatic originals are available without mistaking HLS playlists for caption files", () => {
  assert.deepEqual(youtubeCaptionSource({automatic_captions: {"ja-orig": [{ext: "vtt", url}]}}, "ja-orig"),
    {url, ext: "vtt", headers: {}});
  assert.equal(youtubeCaptionSource({subtitles: {ja: [{ext: "vtt", url, protocol: "m3u8_native"}]}}, "ja"), null);
  assert.equal(youtubeCaptionSource({subtitles: {ja: [{ext: "vtt", url: "https://x/captions.m3u8?sig=1"}]}}, "ja"), null);
  assert.equal(youtubeCaptionSource({subtitles: {ja: [{ext: "vtt", url: "file:///tmp/caption.vtt"}]}}, "ja"), null);
});

test("downloads a long video's caption file directly from existing metadata", async () => {
  let calls = 0;
  const downloaded = await downloadYoutubeCaption({subtitles: {ja: [{ext: "vtt", url}]}}, "ja", async (input, init) => {
    calls++;
    assert.equal(input, url);
    assert.ok(init.signal instanceof AbortSignal);
    return new Response(longCaption);
  });
  assert.equal(calls, 1);
  assert.deepEqual(downloaded, {ext: "vtt", content: longCaption});
});

test("playlist-only tracks fall back without fetching a manifest as text", async () => {
  const downloaded = await downloadYoutubeCaption({subtitles: {ja: [{ext: "vtt", url, protocol: "m3u8_native"}]}}, "ja", async () => {
    assert.fail("A playlist must be downloaded by yt-dlp.");
  });
  assert.equal(downloaded, null);
});

test("expired, empty and invalid caption responses are rejected so extraction can retry", async () => {
  const info = {subtitles: {ja: [{ext: "vtt", url}]}};
  await assert.rejects(downloadYoutubeCaption(info, "ja", async () => new Response("Forbidden", {status: 403})), /HTTP 403/);
  for (const body of ["", "<html>Error</html>", "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n \n"]) {
    await assert.rejects(downloadYoutubeCaption(info, "ja", async () => new Response(body)), /empty or invalid/);
  }
});

test("stalled caption requests are aborted within the configured timeout", async () => {
  const info = {subtitles: {ja: [{ext: "vtt", url}]}};
  let signal: AbortSignal;
  await assert.rejects(downloadYoutubeCaption(info, "ja", async (_input, init) => {
    signal = init.signal;
    return new Promise<Response>((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), {once: true}));
  }, 5), /aborted/);
  assert.equal(signal.aborted, true);
});
