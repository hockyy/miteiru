import assert from "node:assert/strict";
import {test} from "node:test";
import {parseYoutubeSearch, youtubeSearchFilter, youtubeSearchUrl} from "../main/mcp/youtubeSearch";

test("the search filter is YouTube's base64 protobuf", () => {
  assert.equal(youtubeSearchFilter({}), "EgIQAQ==");
  assert.equal(youtubeSearchFilter({duration: "any"}), "EgIQAQ==");
  assert.equal(youtubeSearchFilter({uploaderCaptions: true}), "EgQQASgB");
  assert.equal(youtubeSearchFilter({duration: "short"}), "EgQQARgB");
  assert.equal(youtubeSearchFilter({duration: "medium"}), "EgQQARgD");
  assert.equal(youtubeSearchFilter({duration: "long"}), "EgQQARgC");
  assert.equal(youtubeSearchFilter({duration: "short", uploaderCaptions: true}), "EgYQARgBKAE=");
});

test("the search URL percent-encodes the query and the filter", () => {
  assert.equal(
    youtubeSearchUrl("猫 vlog", {uploaderCaptions: true, duration: "short"}),
    "https://www.youtube.com/results?search_query=%E7%8C%AB%20vlog&sp=EgYQARgBKAE%3D"
  );
  assert.equal(youtubeSearchUrl("a&b=c", {}), "https://www.youtube.com/results?search_query=a%26b%3Dc&sp=EgIQAQ%3D%3D");
});

const entry = (id: string, extra: Record<string, unknown> = {}) => ({id, title: `Title ${id}`, channel: "Channel", ...extra});

test("parseYoutubeSearch reads the fields of each video", () => {
  const [video] = parseYoutubeSearch({
    entries: [entry("aaaaaaaaaaa", {
      channel: null,
      uploader: "Uploader name",
      duration: 125,
      view_count: 4200,
      description: "  first line\n\nsecond   line  "
    })]
  });
  assert.deepEqual(video, {
    id: "aaaaaaaaaaa",
    title: "Title aaaaaaaaaaa",
    channel: "Uploader name",
    durationSeconds: 125,
    views: 4200,
    description: "first line second line"
  });
});

test("parseYoutubeSearch prefers the channel and leaves out what is missing", () => {
  const [video] = parseYoutubeSearch({entries: [entry("bbbbbbbbbbb", {uploader: "someone else"})]});
  assert.equal(video.channel, "Channel");
  assert.equal(video.durationSeconds, null);
  assert.equal(video.views, null);
  assert.equal(video.description, "");
});

test("parseYoutubeSearch cuts the description at 200 characters", () => {
  const [video] = parseYoutubeSearch({entries: [entry("ccccccccccc", {description: "あ".repeat(300)})]});
  assert.equal(Array.from(video.description).length, 200);
});

test("parseYoutubeSearch skips live streams, upcoming premieres, bad ids and repeats", () => {
  const videos = parseYoutubeSearch({
    entries: [
      entry("aaaaaaaaaaa"),
      entry("liveliveliv", {live_status: "is_live"}),
      entry("upcomingabc", {live_status: "is_upcoming"}),
      entry("pastlivexyz", {live_status: "was_live"}),
      entry("short"),
      entry("waytoolongvideoid"),
      entry("bad id chars"),
      {title: "no id"},
      null,
      entry("aaaaaaaaaaa", {title: "repeat"}),
      entry("bbbbbbbbbbb")
    ]
  });
  assert.deepEqual(videos.map((video) => video.id), ["aaaaaaaaaaa", "pastlivexyz", "bbbbbbbbbbb"]);
  assert.equal(videos[0].title, "Title aaaaaaaaaaa");
});

test("parseYoutubeSearch of nothing is an empty list", () => {
  assert.deepEqual(parseYoutubeSearch(null), []);
  assert.deepEqual(parseYoutubeSearch({}), []);
  assert.deepEqual(parseYoutubeSearch({entries: "x"}), []);
});
