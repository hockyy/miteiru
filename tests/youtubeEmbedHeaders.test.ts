import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
  applyYouTubeEmbedRequestHeaders,
  isValidYouTubeEmbedReferer,
  YOUTUBE_EMBED_APP_ORIGIN,
  YOUTUBE_EMBED_APP_REFERER,
} from "../main/youtubeEmbedHeaders";

describe("isValidYouTubeEmbedReferer", () => {
  it("accepts http(s) origins that are not YouTube", () => {
    assert.equal(isValidYouTubeEmbedReferer("https://miteiru.hocky.id/"), true);
    assert.equal(isValidYouTubeEmbedReferer("http://localhost:8888/video"), true);
  });

  it("rejects missing, non-http, and YouTube hosts (error 152)", () => {
    assert.equal(isValidYouTubeEmbedReferer(undefined), false);
    assert.equal(isValidYouTubeEmbedReferer("app://./home"), false);
    assert.equal(isValidYouTubeEmbedReferer("file:///tmp/index.html"), false);
    assert.equal(isValidYouTubeEmbedReferer("https://www.youtube.com/"), false);
    assert.equal(isValidYouTubeEmbedReferer("https://youtube.com/embed/abc"), false);
    assert.equal(isValidYouTubeEmbedReferer("https://www.youtube-nocookie.com/"), false);
  });
});

describe("applyYouTubeEmbedRequestHeaders", () => {
  it("fills a missing Referer on the embed iframe (error 153)", () => {
    const headers = applyYouTubeEmbedRequestHeaders({}, "subFrame");
    assert.equal(headers.Referer, YOUTUBE_EMBED_APP_REFERER);
    assert.equal(headers.Origin, YOUTUBE_EMBED_APP_ORIGIN);
  });

  it("replaces youtube.com Referer/Origin on the embed iframe (error 152)", () => {
    const headers = applyYouTubeEmbedRequestHeaders({
      Referer: "https://www.youtube.com/",
      Origin: "https://www.youtube.com",
    }, "subFrame");
    assert.equal(headers.Referer, YOUTUBE_EMBED_APP_REFERER);
    assert.equal(headers.Origin, YOUTUBE_EMBED_APP_ORIGIN);
  });

  it("keeps a real localhost Referer from the dev server", () => {
    const headers = applyYouTubeEmbedRequestHeaders({
      Referer: "http://localhost:8888/video",
      Origin: "http://localhost:8888",
    }, "subFrame");
    assert.equal(headers.Referer, "http://localhost:8888/video");
    assert.equal(headers.Origin, "http://localhost:8888");
  });

  it("dedupes mixed-case Referer keys so YouTube does not see two values", () => {
    const headers = applyYouTubeEmbedRequestHeaders({
      referer: "https://www.youtube.com/",
      Referer: "https://www.youtube.com/",
    }, "subFrame");
    const refererKeys = Object.keys(headers).filter((key) => key.toLowerCase() === "referer");
    assert.equal(refererKeys.length, 1);
    assert.equal(headers[refererKeys[0]], YOUTUBE_EMBED_APP_REFERER);
  });

  it("does not rewrite player-internal youtube.com Referer on XHRs", () => {
    const headers = applyYouTubeEmbedRequestHeaders({
      Referer: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      Origin: "https://www.youtube.com",
    }, "xhr");
    assert.equal(headers.Referer, "https://www.youtube.com/embed/dQw4w9WgXcQ");
    assert.equal(headers.Origin, "https://www.youtube.com");
  });

  it("fills a missing Referer on non-iframe YouTube requests", () => {
    const headers = applyYouTubeEmbedRequestHeaders({}, "xhr");
    assert.equal(headers.Referer, YOUTUBE_EMBED_APP_REFERER);
    assert.equal(headers.Origin, undefined);
  });
});
