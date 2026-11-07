import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
  buildLastVideo,
  continueLabel,
  filePathOf,
  LAST_VIDEO_KEY,
  loadLastVideo,
  saveLastVideo,
  type VideoStore
} from "../renderer/utils/continueWatching";

const memoryStore = (initial: Record<string, unknown> = {}): VideoStore & { data: Record<string, unknown> } => {
  const data = {...initial};
  return {
    data,
    get: async (key, defaultValue) => (key in data ? data[key] : defaultValue),
    set: async (key, value) => {
      data[key] = value;
    }
  };
};

const filesThatExist = (...paths: string[]) => async (path: string) => paths.includes(path);

describe("buildLastVideo", () => {
  it("keeps the file path, the position and the user's subtitle files", () => {
    const video = buildLastVideo({
      path: "C:/Videos/ep01.mkv",
      position: 754.9,
      duration: 1400,
      primarySubtitle: "C:/Videos/ep01.ja.srt",
      secondarySubtitle: "C:/Videos/ep01.en.srt",
      now: 5
    });
    assert.deepEqual(video, {
      path: "C:/Videos/ep01.mkv",
      title: "ep01.mkv",
      position: 754,
      subtitles: {primary: "C:/Videos/ep01.ja.srt", secondary: "C:/Videos/ep01.en.srt"},
      savedAt: 5
    });
  });

  it("drops the leading slash a Windows video source carries", () => {
    assert.equal(filePathOf("/C:/Videos/ep01.mkv"), "C:/Videos/ep01.mkv");
    assert.equal(filePathOf("/home/me/ep01.mkv"), "/home/me/ep01.mkv");
    assert.equal(buildLastVideo({path: "/C:/Videos/ep01.mkv", position: 30})?.path, "C:/Videos/ep01.mkv");
  });

  it("leaves out subtitles Miteiru extracted, which are deleted when the video changes", () => {
    const video = buildLastVideo({
      path: "/home/me/ep01.mkv",
      position: 30,
      primarySubtitle: "/tmp/miteiru_subtitle_1.srt",
      secondarySubtitle: "/tmp/miteiru_youtube_2.srt"
    });
    assert.deepEqual(video?.subtitles, {primary: undefined, secondary: undefined});
  });

  it("starts again from the top when the video was nearly finished", () => {
    assert.equal(buildLastVideo({path: "/home/me/a.mp4", position: 1395, duration: 1400})?.position, 0);
    assert.equal(buildLastVideo({path: "/home/me/a.mp4", position: 1000, duration: 1400})?.position, 1000);
  });

  it("keeps a YouTube link as it is, titled by the video or generically", () => {
    const url = "https://www.youtube.com/watch?v=abcdefghijk";
    assert.equal(buildLastVideo({path: url, title: "A song", position: 12})?.title, "A song");
    assert.equal(buildLastVideo({path: url, position: 12})?.title, "YouTube video");
    assert.equal(buildLastVideo({path: url, position: 12})?.path, url);
  });

  it("saves nothing without a video", () => {
    assert.equal(buildLastVideo({path: "", position: 5}), null);
  });
});

describe("saving and loading the last video", () => {
  it("loads what was saved when the file is still there", async () => {
    const store = memoryStore();
    const video = buildLastVideo({
      path: "/home/me/ep01.mkv", position: 90, primarySubtitle: "/home/me/ep01.ja.srt", now: 1
    });
    await saveLastVideo(store, video);
    assert.ok(LAST_VIDEO_KEY in store.data);
    const loaded = await loadLastVideo(store, filesThatExist("/home/me/ep01.mkv", "/home/me/ep01.ja.srt"));
    assert.equal(loaded?.path, "/home/me/ep01.mkv");
    assert.equal(loaded?.position, 90);
    assert.equal(loaded?.subtitles.primary, "/home/me/ep01.ja.srt");
  });

  it("offers nothing when the video file no longer exists", async () => {
    const store = memoryStore();
    await saveLastVideo(store, buildLastVideo({path: "/home/me/gone.mkv", position: 90}));
    assert.equal(await loadLastVideo(store, filesThatExist()), null);
  });

  it("still continues the video when only a subtitle file has gone", async () => {
    const store = memoryStore();
    await saveLastVideo(store, buildLastVideo({
      path: "/home/me/ep01.mkv", position: 90, primarySubtitle: "/home/me/gone.srt", secondarySubtitle: "/home/me/ep01.en.srt"
    }));
    const loaded = await loadLastVideo(store, filesThatExist("/home/me/ep01.mkv", "/home/me/ep01.en.srt"));
    assert.equal(loaded?.subtitles.primary, undefined);
    assert.equal(loaded?.subtitles.secondary, "/home/me/ep01.en.srt");
  });

  it("offers a YouTube video without looking for a file", async () => {
    const store = memoryStore();
    const url = "https://www.youtube.com/watch?v=abcdefghijk";
    await saveLastVideo(store, buildLastVideo({path: url, title: "A song", position: 75}));
    const loaded = await loadLastVideo(store, async () => {
      throw new Error("no file to look for");
    });
    assert.equal(loaded?.path, url);
    assert.equal(loaded?.position, 75);
  });

  it("offers nothing when nothing was saved, or the saved value is not a video", async () => {
    assert.equal(await loadLastVideo(memoryStore(), filesThatExist()), null);
    assert.equal(await loadLastVideo(memoryStore({[LAST_VIDEO_KEY]: "nonsense"}), filesThatExist()), null);
    assert.equal(await loadLastVideo(memoryStore({[LAST_VIDEO_KEY]: {path: "", position: 1}}), filesThatExist()), null);
  });

  it("offers nothing when the store cannot be read", async () => {
    const broken: VideoStore = {
      get: async () => {
        throw new Error("store down");
      },
      set: async () => undefined
    };
    assert.equal(await loadLastVideo(broken, filesThatExist()), null);
  });

  it("does not overwrite the saved video with nothing", async () => {
    const store = memoryStore({[LAST_VIDEO_KEY]: {path: "/home/me/a.mkv", position: 1}});
    await saveLastVideo(store, null);
    assert.deepEqual(store.data[LAST_VIDEO_KEY], {path: "/home/me/a.mkv", position: 1});
  });
});

describe("continueLabel", () => {
  it("names the video and the time", () => {
    assert.equal(continueLabel({title: "ep01.mkv", position: 754}), "Continue ep01.mkv at 12:34");
    assert.equal(continueLabel({title: "ep01.mkv", position: 3754}), "Continue ep01.mkv at 1:02:34");
  });

  it("leaves the time out near the start", () => {
    assert.equal(continueLabel({title: "ep01.mkv", position: 2}), "Continue ep01.mkv");
  });
});
