import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {extractVideoId, isYoutube, parseYoutubeVideoId} from "../renderer/utils/utils";
import {buildVideoSource, getYoutubeVideoId, normalizeDroppedPath} from "../renderer/utils/mediaUtils";

const ID = "dQw4w9WgXcQ";

const accepted = [
  `https://www.youtube.com/watch?v=${ID}`,
  `https://www.youtube.com/watch?v=${ID}&list=PLabc123&index=2`,
  `https://www.youtube.com/watch?v=${ID}&t=95s`,
  `https://www.youtube.com/watch?app=desktop&v=${ID}`,
  `https://www.youtube.com/watch?feature=share&v=${ID}`,
  `https://m.youtube.com/watch?v=${ID}`,
  `https://music.youtube.com/watch?v=${ID}&si=xyz`,
  `https://youtu.be/${ID}?si=AbCdEf&t=95`,
  `http://youtu.be/${ID}`,
  `https://www.youtube.com/live/${ID}?si=xyz`,
  `https://www.youtube.com/shorts/${ID}?feature=share`,
  `https://youtube.com/embed/${ID}?start=30`,
  `https://www.youtube.com/v/${ID}`,
  `https://www.youtube-nocookie.com/embed/${ID}`,
  `youtu.be/${ID}`,
  `www.youtube.com/watch?v=${ID}`,
  `youtube.com/shorts/${ID}`,
  `  https://youtu.be/${ID}  `,
];

const rejected = [
  "https://www.youtube.com/@somechannel",
  "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv",
  "https://www.youtube.com/playlist?list=PLabc123",
  "https://www.youtube.com/watch?list=PLabc123",
  "https://www.youtube.com/",
  "https://www.youtube.com/watch?v=short",
  "https://vimeo.com/123456789",
  `https://notyoutube.com/watch?v=${ID}`,
  `https://youtube.com.evil.example/watch?v=${ID}`,
  `ftp://youtu.be/${ID}`,
  "C:\videos\movie.mp4",
  "/home/me/movie.mp4",
  "",
];

describe("YouTube links", () => {
  for (const link of accepted) {
    it(`reads the ID from ${link.trim()}`, () => {
      assert.equal(parseYoutubeVideoId(link), ID);
      assert.equal(extractVideoId(link), ID);
      assert.equal(getYoutubeVideoId(link), ID);
      assert.equal(isYoutube(link), true);
    });
  }

  for (const link of rejected) {
    it(`rejects "${link}"`, () => {
      assert.equal(parseYoutubeVideoId(link), null);
      assert.equal(isYoutube(link), false);
    });
  }

  it("still takes a bare 11-character ID where a caller passes one", () => {
    assert.equal(getYoutubeVideoId(ID), ID);
    assert.equal(isYoutube(ID), false);
  });

  it("gives the embed a plain watch link, without the playlist", () => {
    const source = buildVideoSource(`https://www.youtube.com/shorts/${ID}?feature=share`, "unused");
    assert.equal(source.type, "video/youtube");
    assert.equal(source.src, `https://www.youtube.com/watch?v=${ID}`);
    assert.equal(buildVideoSource(`https://youtu.be/${ID}?list=PLabc`, "unused").src, `https://www.youtube.com/watch?v=${ID}`);
  });

  it("gives a pasted link without a scheme its https://", () => {
    assert.equal(normalizeDroppedPath(`youtu.be/${ID}`).currentPath, `https://youtu.be/${ID}`);
    assert.equal(normalizeDroppedPath(`https://youtu.be/${ID}`).currentPath, `https://youtu.be/${ID}`);
  });
});
