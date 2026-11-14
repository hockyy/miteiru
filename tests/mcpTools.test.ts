import assert from "node:assert/strict";
import {test} from "node:test";
import {mcpDefinitions, ToolError, validateToolArguments} from "../main/mcp/protocol";
import {createMiteiruTools, type LearningLanguage, type MiteiruToolDeps, type MiteiruTools, type OpenVideoRequest} from "../main/mcp/tools";

const JAPANESE: LearningLanguage = {code: "ja", name: "Japanese", tokenizerMode: "kuromoji", pluginId: "japanese-kuromoji"};
const MANDARIN: LearningLanguage = {code: "zh-CN", name: "Chinese", tokenizerMode: "jieba", pluginId: "mandarin-jieba"};
const VIETNAMESE: LearningLanguage = {code: "vi", name: "Vietnamese", tokenizerMode: "vietnamese", pluginId: "vietnamese"};

const IDS = ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc", "ddddddddddd", "eeeeeeeeeee", "fffffffffff", "ggggggggggg", "hhhhhhhhhhh", "iiiiiiiiiii"];

const formats = [{ext: "vtt", url: "https://example.com/captions.vtt"}];

/** yt-dlp's description of a video, with the given uploader and automatic caption tracks. */
const info = (manual: string[], automatic: string[] = [], extra: Record<string, unknown> = {}) => ({
  title: "Cat video",
  channel: "Cat channel",
  duration: 600,
  upload_date: "20260102",
  view_count: 1234,
  subtitles: Object.fromEntries(manual.map((code) => [code, formats])),
  automatic_captions: Object.fromEntries(automatic.map((code) => [code, formats])),
  ...extra
});

const listing = (count: number) => ({
  entries: IDS.slice(0, count).map((id, index) => ({id, title: `Video ${index}`, channel: "Chan", duration: 125, view_count: 1000 + index}))
});

const failIfCalled = (name: string) => async (): Promise<never> => {
  throw new Error(`${name} should not have been called`);
};

const makeDeps = (overrides: Partial<MiteiruToolDeps> = {}): MiteiruToolDeps => ({
  version: "8.2.0",
  loadedLanguage: () => JAPANESE,
  rememberedLanguage: async () => JAPANESE,
  loadLanguage: async () => undefined,
  analyze: async () => [],
  savedWords: async () => ({}),
  lastVideo: async () => null,
  ytDlpAvailable: async () => true,
  searchYoutube: async () => ({entries: []}),
  videoInfo: async () => info(["ja"]),
  captionText: async () => "",
  openInWindow: async () => "opened",
  ...overrides
});

/** A tool call as the MCP and REST routes make it: the arguments are checked first, then the tool runs. */
const call = async (tools: MiteiruTools, name: string, args: unknown = {}): Promise<any> => tools[name](validateToolArguments(name, args));
const run = (deps: MiteiruToolDeps, name: string, args: unknown = {}) => call(createMiteiruTools(deps), name, args);

const toolError = (status: number, message?: string) => (error: unknown) => {
  assert.ok(error instanceof ToolError, `expected a ToolError, got ${String(error)}`);
  assert.equal(error.status, status);
  if (message !== undefined) assert.equal(error.message, message);
  return true;
};

const NO_LANGUAGE = "No language is chosen in Miteiru yet. Pick one on Miteiru's Home screen, then try again.";

test("every tool in the definitions has an implementation, and every implementation a definition", () => {
  const implemented = Object.keys(createMiteiruTools(makeDeps())).sort();
  assert.deepEqual(implemented, mcpDefinitions.tools.map((tool) => tool.name).sort());
});

test("an unknown tool is a 404 and invalid arguments a 400, before any tool runs", async () => {
  await assert.rejects(run(makeDeps(), "nope"), toolError(404, "Unknown tool: nope"));
  await assert.rejects(run(makeDeps(), "rate_video", {}), toolError(400, "Missing argument: video"));
});

// ---- get_status ------------------------------------------------------------------------------

test("get_status reports the loaded language, saved word counts, the last video and yt-dlp", async () => {
  const status = await run(makeDeps({
    savedWords: async () => ({猫: {level: 1, updTime: 1}, 犬: {level: 2, updTime: 1}, 鳥: {level: 2, updTime: 1}, 魚: {level: 0, updTime: 1}}),
    lastVideo: async () => ({
      path: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
      title: "Cat video",
      position: 75,
      subtitles: {},
      savedAt: Date.UTC(2026, 10, 9, 12, 0, 0)
    }),
    ytDlpAvailable: async () => false
  }), "get_status");
  assert.deepEqual(status, {
    version: "8.2.0",
    language: {code: "ja", name: "Japanese", loaded: true},
    savedWords: {learning: 1, known: 2},
    lastVideo: {title: "Cat video", video: "https://www.youtube.com/watch?v=aaaaaaaaaaa", stoppedAt: "1:15", watched: "2026-11-09T12:00:00.000Z"},
    youtube: {ytDlp: false}
  });
});

test("get_status uses the remembered language without loading it", async () => {
  const requested: string[] = [];
  const status = await run(makeDeps({
    loadedLanguage: () => null,
    rememberedLanguage: async () => MANDARIN,
    loadLanguage: failIfCalled("loadLanguage"),
    savedWords: async (code) => { requested.push(code); return {}; }
  }), "get_status");
  assert.deepEqual(status.language, {code: "zh-CN", name: "Chinese", loaded: false});
  assert.deepEqual(status.savedWords, {learning: 0, known: 0});
  assert.deepEqual(requested, ["zh-CN"]);
});

test("get_status with no language says so and reads no words", async () => {
  const status = await run(makeDeps({
    loadedLanguage: () => null,
    rememberedLanguage: async () => null,
    savedWords: failIfCalled("savedWords")
  }), "get_status");
  assert.equal(status.language, null);
  assert.equal(status.savedWords, null);
  assert.equal(status.lastVideo, null);
});

test("a last video past an hour stops at h:mm:ss", async () => {
  const status = await run(makeDeps({
    lastVideo: async () => ({path: "/videos/ep01.mkv", title: "ep01", position: 3725, subtitles: {}, savedAt: 0})
  }), "get_status");
  assert.equal(status.lastVideo.stoppedAt, "1:02:05");
});

// ---- search_videos ---------------------------------------------------------------------------

/** Three results: an uploader-captioned one, an automatic-only one, and one with no Japanese. */
const searchDeps = (overrides: Partial<MiteiruToolDeps> = {}) => {
  const searches: Array<[string, number]> = [];
  const checked: string[] = [];
  const infos: Record<string, any> = {
    aaaaaaaaaaa: info(["ja", "en"]),
    bbbbbbbbbbb: info([], ["ja-orig", "ja"]),
    ccccccccccc: info(["en"])
  };
  const deps = makeDeps({
    searchYoutube: async (url, count) => { searches.push([url, count]); return listing(3); },
    videoInfo: async (id) => { checked.push(id); return infos[id]; },
    ...overrides
  });
  return {deps, searches, checked};
};

test("search_videos with learning-language keeps automatic captions and drops videos with none", async () => {
  const {deps, searches} = searchDeps();
  const result = await run(deps, "search_videos", {query: "猫"});
  assert.deepEqual(result.language, {code: "ja", name: "Japanese"});
  assert.equal(result.query, "猫");
  assert.deepEqual(result.videos.map((video: any) => video.id), ["aaaaaaaaaaa", "bbbbbbbbbbb"]);
  assert.equal(result.checked, 3);
  assert.deepEqual(result.skipped, {noCaptions: 1, failed: 0});
  assert.equal(result.note, undefined);

  const [uploader, automatic] = result.videos;
  assert.deepEqual(uploader.captions, {
    main: {code: "ja", name: "Japanese", kind: "uploader"},
    translation: {code: "en", name: "English", kind: "uploader"}
  });
  assert.equal(automatic.captions.main.kind, "automatic");
  assert.equal(automatic.captions.translation, null);
  assert.deepEqual({...uploader, captions: undefined}, {
    id: "aaaaaaaaaaa",
    url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
    title: "Video 0",
    channel: "Chan",
    duration: "2:05",
    views: 1000,
    uploaded: "2026-01-02",
    description: "",
    captions: undefined
  });
  // 3 times the limit (5 by default) are asked for, since many results have no captions.
  assert.equal(searches[0][1], 15);
  assert.match(searches[0][0], /search_query=%E7%8C%AB&sp=EgIQAQ%3D%3D$/);
});

test("search_videos with uploader captions drops automatic ones and asks YouTube for them", async () => {
  const {deps, searches} = searchDeps();
  const result = await run(deps, "search_videos", {query: "猫", captions: "uploader", duration: "short", limit: 10});
  assert.deepEqual(result.videos.map((video: any) => video.id), ["aaaaaaaaaaa"]);
  assert.deepEqual(result.skipped, {noCaptions: 2, failed: 0});
  assert.match(searches[0][0], /sp=EgYQARgBKAE%3D$/);
  // At most 15: each one checked is a full YouTube run.
  assert.equal(searches[0][1], 15);
});

test("search_videos with captions any never reads a video's captions", async () => {
  const {deps, searches} = searchDeps({videoInfo: failIfCalled("videoInfo")});
  const result = await run(deps, "search_videos", {query: "猫", captions: "any", limit: 2});
  assert.equal(result.videos.length, 2);
  assert.deepEqual(result.videos.map((video: any) => video.captions), [null, null]);
  assert.equal(result.videos[0].uploaded, null);
  assert.equal(result.checked, 0);
  assert.equal(searches[0][1], 2);
});

test("search_videos stops once it has enough videos", async () => {
  const infos = Object.fromEntries(IDS.map((id) => [id, info(["ja"])]));
  const result = await run(makeDeps({
    searchYoutube: async () => listing(9),
    videoInfo: async (id) => infos[id]
  }), "search_videos", {query: "猫", limit: 4});
  assert.deepEqual(result.videos.map((video: any) => video.id), IDS.slice(0, 4));
  assert.equal(result.checked, 4);
});

test("search_videos stops starting checks once its 45 seconds are used", async () => {
  let clock = 0;
  const result = await run(makeDeps({
    now: () => clock,
    searchYoutube: async () => listing(9),
    // Each check takes a minute on the fake clock, and finds nothing.
    videoInfo: async () => { clock += 60_000; return info(["fr"]); }
  }), "search_videos", {query: "猫"});
  assert.equal(result.checked, 3);
  assert.equal(result.videos.length, 0);
  assert.equal(result.note, "Stopped checking captions after 45 seconds; search again with a narrower query.");
});

test("search_videos gives up on a check that is still running when the budget ends", async () => {
  const readings = [0, 44_950];
  const result = await run(makeDeps({
    now: () => readings.shift() ?? 100_000,
    searchYoutube: async () => listing(6),
    videoInfo: () => new Promise(() => undefined)
  }), "search_videos", {query: "猫"});
  assert.equal(result.checked, 3);
  assert.deepEqual(result.skipped, {noCaptions: 0, failed: 3});
  assert.match(result.note, /^Stopped checking captions after 45 seconds/);
});

test("search_videos skips a video whose check fails, and says why when every check does", async () => {
  const failing = makeDeps({
    searchYoutube: async () => listing(4),
    videoInfo: async () => { throw new Error("yt-dlp was not found. Put yt-dlp.exe in C:\\tools or on your PATH."); }
  });
  const result = await run(failing, "search_videos", {query: "猫", limit: 2});
  assert.equal(result.checked, 4);
  assert.deepEqual(result.skipped, {noCaptions: 0, failed: 4});
  assert.equal(result.note, "Every caption check failed: yt-dlp was not found. Put yt-dlp.exe in C:\\tools or on your PATH.");

  const mixed = await run(makeDeps({
    searchYoutube: async () => listing(2),
    videoInfo: async (id) => { if (id === IDS[0]) throw new Error("This video is private"); return info(["ja"]); }
  }), "search_videos", {query: "猫"});
  assert.deepEqual(mixed.videos.map((video: any) => video.id), [IDS[1]]);
  assert.deepEqual(mixed.skipped, {noCaptions: 0, failed: 1});
  assert.equal(mixed.note, undefined);
});

test("search_videos turns a yt-dlp failure into a 502 with its message", async () => {
  const deps = makeDeps({searchYoutube: async () => { throw new Error("yt-dlp was not found."); }});
  await assert.rejects(run(deps, "search_videos", {query: "猫"}), toolError(502, "yt-dlp was not found."));
});

test("search_videos needs a language, unless captions are not checked", async () => {
  const none = {loadedLanguage: () => null, rememberedLanguage: async () => null};
  await assert.rejects(run(makeDeps({...none, searchYoutube: failIfCalled("searchYoutube")}), "search_videos", {query: "猫"}), toolError(409, NO_LANGUAGE));
  await assert.rejects(run(makeDeps({...none, searchYoutube: failIfCalled("searchYoutube")}), "search_videos", {query: "猫", captions: "uploader"}), toolError(409, NO_LANGUAGE));
  const any = await run(makeDeps({...none, searchYoutube: async () => listing(2)}), "search_videos", {query: "猫", captions: "any"});
  assert.equal(any.language, null);
  assert.equal(any.videos.length, 2);
});

test("search_videos uses the remembered language when none is loaded, without loading it", async () => {
  const deps = makeDeps({
    loadedLanguage: () => null,
    rememberedLanguage: async () => MANDARIN,
    loadLanguage: failIfCalled("loadLanguage"),
    searchYoutube: async () => listing(1),
    videoInfo: async () => info(["zh-Hans", "en"])
  });
  const result = await run(deps, "search_videos", {query: "猫"});
  assert.deepEqual(result.language, {code: "zh-CN", name: "Chinese"});
  assert.equal(result.videos[0].captions.main.code, "zh-Hans");
});

// ---- rate_video ------------------------------------------------------------------------------

const VTT = `WEBVTT

00:00:00.000 --> 00:00:02.000
猫が好き

00:00:02.000 --> 00:00:04.000
猫が好き

00:00:04.000 --> 00:00:06.000
<c>犬</c>が好き

00:00:06.000 --> 00:00:07.000
  `;

const JAPANESE_LINES: Record<string, any[]> = {
  猫が好き: [
    {origin: "猫", basicForm: "猫", hiragana: "ねこ", pos: "名詞"},
    {origin: "が", basicForm: "が", hiragana: "が", pos: "助詞"},
    {origin: "好き", basicForm: "好き", hiragana: "すき", pos: "名詞"}
  ],
  犬が好き: [
    {origin: "犬", basicForm: "犬", hiragana: "いぬ", pos: "名詞"},
    {origin: "が", basicForm: "が", hiragana: "が", pos: "助詞"},
    {origin: "好き", basicForm: "好き", hiragana: "すき", pos: "名詞"}
  ]
};

test("rate_video reads the captions, drops repeated lines, and compares them with the saved words", async () => {
  const analyzed: string[] = [];
  const result = await run(makeDeps({
    videoInfo: async () => info(["ja", "en"], ["ja-orig"]),
    captionText: async (id, code) => { assert.deepEqual([id, code], ["aaaaaaaaaaa", "ja"]); return VTT; },
    analyze: async (text) => { analyzed.push(text); return JAPANESE_LINES[text]; },
    savedWords: async () => ({猫: {level: 2, updTime: 1}})
  }), "rate_video", {video: "https://youtu.be/aaaaaaaaaaa?t=5"});

  assert.deepEqual(analyzed, ["猫が好き", "犬が好き"]);
  assert.deepEqual(result.video, {
    id: "aaaaaaaaaaa",
    url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
    title: "Cat video",
    channel: "Cat channel",
    duration: "10:00",
    uploaded: "2026-01-02",
    views: 1234
  });
  assert.deepEqual(result.language, {code: "ja", name: "Japanese"});
  assert.deepEqual(result.captions.main, {code: "ja", name: "Japanese", kind: "uploader"});
  assert.deepEqual(result.captions.translation, {code: "en", name: "English", kind: "uploader"});
  assert.deepEqual(result.captions.available.map((track: any) => track.code), ["en", "ja", "ja-orig"]);
  // 猫, 好き, 犬, 好き are spoken; the particle が is not counted.
  assert.deepEqual(result.words, {spoken: 4, different: 3, differentNotSaved: 2});
  assert.deepEqual(result.coverage, {known: 25, learning: 0, notSaved: 75});
  assert.equal(result.verdict, "hard");
  // 6 tokens with letters in 10 minutes.
  assert.equal(result.wordsPerMinute, 1);
  assert.deepEqual(result.topNotSaved, [{word: "好き", reading: "すき", count: 2}, {word: "犬", reading: "いぬ", count: 1}]);
  assert.deepEqual(result.learningWordsHeard, []);
  assert.deepEqual(result.firstLines, ["猫が好き", "犬が好き"]);
  assert.equal(result.note, "Particles, auxiliary verbs, prefixes (お, ご), grammatical nouns (の, こと, よう), name suffixes (さん), interjections and fillers are not counted. Learners rarely save every word they know, so the saved share is a lower bound.");
});

test("rate_video's note leaves out the Japanese part for other languages", async () => {
  const result = await run(makeDeps({
    loadedLanguage: () => MANDARIN,
    videoInfo: async () => info(["zh-Hans"]),
    captionText: async () => "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n你好\n",
    analyze: async () => [{origin: "你好", pinyin: "ni3 hao3"}]
  }), "rate_video", {video: "aaaaaaaaaaa"});
  assert.equal(result.note, "Learners rarely save every word they know, so the saved share is a lower bound.");
  assert.deepEqual(result.topNotSaved, [{word: "你好", reading: "ni3 hao3", count: 1}]);
  // One word in the video's 10 minutes rounds to 0 a minute.
  assert.equal(result.wordsPerMinute, 0);
});

test("rate_video falls back to the last caption's end for the length of a video without a duration", async () => {
  const result = await run(makeDeps({
    videoInfo: async () => info(["ja"], [], {duration: undefined}),
    captionText: async () => "WEBVTT\n\n00:00:00.000 --> 00:01:00.000\n猫が好き\n",
    analyze: async () => JAPANESE_LINES.猫が好き
  }), "rate_video", {video: "aaaaaaaaaaa"});
  // Two words with letters (猫, 好き) plus が: 3 in one minute.
  assert.equal(result.wordsPerMinute, 3);
  assert.equal(result.video.duration, null);
});

test("rate_video with no captions in the language is a 404 that lists the tracks it has", async () => {
  await assert.rejects(
    run(makeDeps({videoInfo: async () => info(["fr"], ["en-orig"])}), "rate_video", {video: "aaaaaaaaaaa"}),
    toolError(404, "\"Cat video\" has no captions in Japanese. Its captions: fr (French, uploader), en-orig (English, automatic)")
  );
  await assert.rejects(
    run(makeDeps({videoInfo: async () => info([])}), "rate_video", {video: "aaaaaaaaaaa"}),
    toolError(404, "\"Cat video\" has no captions in Japanese. It has no captions.")
  );
});

test("rate_video loads the remembered language when none is loaded", async () => {
  let loaded: LearningLanguage | null = null;
  const loads: string[] = [];
  const result = await run(makeDeps({
    loadedLanguage: () => loaded,
    rememberedLanguage: async () => JAPANESE,
    loadLanguage: async (language) => { loads.push(language.pluginId); loaded = language; },
    captionText: async () => VTT,
    analyze: async (text) => JAPANESE_LINES[text]
  }), "rate_video", {video: "aaaaaaaaaaa"});
  assert.deepEqual(loads, ["japanese-kuromoji"]);
  assert.deepEqual(result.language, {code: "ja", name: "Japanese"});
});

test("rate_video rejects something that is not a YouTube video", async () => {
  await assert.rejects(run(makeDeps(), "rate_video", {video: "https://example.com/watch?v=aaaaaaaaaaa"}),
    toolError(400, "Not a YouTube link or video id: https://example.com/watch?v=aaaaaaaaaaa"));
  await assert.rejects(run(makeDeps(), "rate_video", {video: "tooshort"}), toolError(400, "Not a YouTube link or video id: tooshort"));
});

test("rate_video turns a yt-dlp failure into a 502", async () => {
  await assert.rejects(
    run(makeDeps({videoInfo: async () => { throw new Error("Video unavailable"); }}), "rate_video", {video: "aaaaaaaaaaa"}),
    toolError(502, "Video unavailable")
  );
  await assert.rejects(
    run(makeDeps({captionText: async () => { throw new Error("Could not download captions"); }}), "rate_video", {video: "aaaaaaaaaaa"}),
    toolError(502, "Could not download captions")
  );
});

// ---- the language load -----------------------------------------------------------------------

test("with no language chosen at all, a tool that needs one is a 409", async () => {
  const deps = makeDeps({loadedLanguage: () => null, rememberedLanguage: async () => null, loadLanguage: failIfCalled("loadLanguage")});
  await assert.rejects(run(deps, "rate_video", {video: "aaaaaaaaaaa"}), toolError(409, NO_LANGUAGE));
  await assert.rejects(run(deps, "analyze_text", {text: "猫"}), toolError(409, NO_LANGUAGE));
  await assert.rejects(run(deps, "open_video", {video: "aaaaaaaaaaa"}), toolError(409, NO_LANGUAGE));
  await assert.rejects(run(deps, "list_saved_words"), toolError(409, NO_LANGUAGE));
});

test("a language that fails to load is a 409 that names it and says why", async () => {
  const deps = makeDeps({
    loadedLanguage: () => null,
    loadLanguage: async () => { throw new Error("the dictionary is missing"); }
  });
  await assert.rejects(run(deps, "analyze_text", {text: "猫"}), toolError(409, "Miteiru couldn't load Japanese: the dictionary is missing"));
});

test("two tools asking at once share one language load", async () => {
  let loaded: LearningLanguage | null = null;
  let loads = 0;
  const deps = makeDeps({
    loadedLanguage: () => loaded,
    loadLanguage: async (language) => {
      loads++;
      await new Promise((resolve) => setTimeout(resolve, 20));
      loaded = language;
    },
    analyze: async () => []
  });
  const tools = createMiteiruTools(deps);
  await Promise.all([tools.analyze_text({text: "猫"}), tools.analyze_text({text: "犬"})]);
  assert.equal(loads, 1);
  await tools.analyze_text({text: "鳥"});
  assert.equal(loads, 1);
});

// ---- open_video ------------------------------------------------------------------------------

const openDeps = (overrides: Partial<MiteiruToolDeps> = {}) => {
  const requests: OpenVideoRequest[] = [];
  const deps = makeDeps({
    videoInfo: async () => info(["ja", "en"], ["ja-orig"]),
    openInWindow: async (request) => { requests.push(request); return "opened"; },
    ...overrides
  });
  return {deps, requests};
};

test("open_video picks the uploader's captions and English underneath", async () => {
  const {deps, requests} = openDeps();
  const result = await run(deps, "open_video", {video: "https://www.youtube.com/watch?v=aaaaaaaaaaa"});
  assert.deepEqual(requests, [{
    videoId: "aaaaaaaaaaa",
    url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
    title: "Cat video",
    startAt: 0,
    main: "ja",
    translation: "en"
  }]);
  assert.deepEqual(result, {
    opened: true,
    video: {id: "aaaaaaaaaaa", url: "https://www.youtube.com/watch?v=aaaaaaaaaaa", title: "Cat video"},
    subtitles: {
      main: {code: "ja", name: "Japanese", kind: "uploader"},
      translation: {code: "en", name: "English", kind: "uploader"}
    }
  });
});

test("open_video takes the start time, a chosen main track, and translation none", async () => {
  const {deps, requests} = openDeps();
  const result = await run(deps, "open_video", {video: "aaaaaaaaaaa", main_subtitle: "ja-orig", translation: "none", start_at: 93.5});
  assert.deepEqual(requests[0], {
    videoId: "aaaaaaaaaaa",
    url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
    title: "Cat video",
    startAt: 93.5,
    main: "ja-orig",
    translation: null
  });
  assert.equal(result.subtitles.main.kind, "automatic");
  assert.equal(result.subtitles.translation, null);
});

test("open_video can pick another track for the translation", async () => {
  const {deps, requests} = openDeps({videoInfo: async () => info(["ja", "en", "ko"])});
  await run(deps, "open_video", {video: "aaaaaaaaaaa", translation: "ko"});
  assert.equal(requests[0].translation, "ko");
});

test("open_video does not show the same track as main and translation", async () => {
  const {deps, requests} = openDeps();
  await run(deps, "open_video", {video: "aaaaaaaaaaa", main_subtitle: "en"});
  assert.deepEqual([requests[0].main, requests[0].translation], ["en", null]);
});

test("open_video with a caption track the video does not have is a 400 listing its tracks", async () => {
  const {deps, requests} = openDeps();
  await assert.rejects(run(deps, "open_video", {video: "aaaaaaaaaaa", main_subtitle: "ko"}),
    toolError(400, "This video has no caption track ko. Its tracks: en, ja, ja-orig"));
  await assert.rejects(run(deps, "open_video", {video: "aaaaaaaaaaa", translation: "fr"}),
    toolError(400, "This video has no caption track fr. Its tracks: en, ja, ja-orig"));
  assert.equal(requests.length, 0);
});

test("open_video says when Miteiru's window has not taken the request yet", async () => {
  const {deps} = openDeps({openInWindow: async () => "waiting"});
  const result = await run(deps, "open_video", {video: "aaaaaaaaaaa"});
  assert.equal(result.opened, false);
  assert.equal(result.note, "Miteiru's window hasn't picked this up yet. It opens there if the window shows its video page within a minute.");
});

test("open_video opens a video with no captions in the language, without a main subtitle", async () => {
  const {deps, requests} = openDeps({videoInfo: async () => info(["fr"])});
  const result = await run(deps, "open_video", {video: "aaaaaaaaaaa"});
  assert.equal(requests[0].main, null);
  assert.deepEqual(result.subtitles, {main: null, translation: null});
  assert.equal(result.note, "It has no captions in Japanese, so it opened without a main subtitle.");
});

// ---- analyze_text ----------------------------------------------------------------------------

test("analyze_text lists the words with their forms, readings, and saved levels", async () => {
  const result = await run(makeDeps({
    analyze: async () => [
      {origin: "猫", basicForm: "*", hiragana: "ねこ", pos: "名詞-一般"},
      {origin: "が", basicForm: "が", hiragana: "が", pos: "助詞-格助詞"},
      {origin: "見た", basicForm: "見る", hiragana: "みた", pos: "動詞"},
      {origin: "です", basicForm: "です", hiragana: "です", pos: "助動詞"},
      {origin: "3", basicForm: "3", hiragana: "3", pos: "名詞-数"},
      {origin: "。", basicForm: "。", hiragana: "。", pos: "記号-句点"}
    ],
    savedWords: async () => ({猫: {level: 2, updTime: 1}, 見る: {level: 1, updTime: 1}})
  }), "analyze_text", {text: "猫が見たです3。"});
  assert.deepEqual(result, {
    language: {code: "ja", name: "Japanese"},
    words: [
      {text: "猫", reading: "ねこ", pos: "名詞-一般", level: "known"},
      {text: "が", pos: "助詞-格助詞", level: "new"},
      {text: "見た", base: "見る", reading: "みた", pos: "動詞", level: "learning"},
      {text: "です", pos: "助動詞", level: "new"},
      {text: "3", pos: "名詞-数", level: "new"}
    ]
  });
});

test("analyze_text gives pinyin for Mandarin, jyutping for Cantonese and meanings for Vietnamese", async () => {
  const mandarin = await run(makeDeps({
    loadedLanguage: () => MANDARIN,
    analyze: async () => [{origin: "你好", pinyin: " ni3 hao3 "}, {origin: "，", pinyin: ""}],
    savedWords: async () => ({你好: {level: 1, updTime: 1}})
  }), "analyze_text", {text: "你好，"});
  assert.deepEqual(mandarin.words, [{text: "你好", reading: "ni3 hao3", level: "learning"}]);

  const cantonese = await run(makeDeps({
    loadedLanguage: () => ({code: "yue", name: "Cantonese", tokenizerMode: "cantonese", pluginId: "cantonese-jieba"}),
    analyze: async () => [{origin: "食飯", jyutping: "sik6 faan6"}]
  }), "analyze_text", {text: "食飯"});
  assert.deepEqual(cantonese.words, [{text: "食飯", reading: "sik6 faan6", level: "new"}]);

  const vietnamese = await run(makeDeps({
    loadedLanguage: () => VIETNAMESE,
    analyze: async () => [{origin: "xin chào", meaning: "hello"}, {origin: "bạn", meaning: ""}]
  }), "analyze_text", {text: "xin chào bạn"});
  assert.deepEqual(vietnamese.words, [
    {text: "xin chào", meaning: "hello", level: "new"},
    {text: "bạn", level: "new"}
  ]);
});

// ---- list_saved_words ------------------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;
const SAVED = {
  a: {level: 1, updTime: Date.UTC(2026, 10, 9)},
  b: {level: 2, updTime: Date.UTC(2026, 10, 3)},
  c: {level: 1, updTime: 0},
  d: {level: 0, updTime: Date.UTC(2026, 10, 12)},
  e: {level: 1, updTime: Date.UTC(2026, 10, 9) + DAY},
  f: {level: 2, updTime: Date.UTC(2026, 10, 8)}
};

test("list_saved_words defaults to Learning words, most recently changed first", async () => {
  const result = await run(makeDeps({savedWords: async () => SAVED}), "list_saved_words");
  assert.deepEqual(result, {
    language: {code: "ja", name: "Japanese"},
    total: {learning: 3, known: 2},
    words: [
      {word: "e", level: "learning", changed: "2026-11-10"},
      {word: "a", level: "learning", changed: "2026-11-09"},
      {word: "c", level: "learning"}
    ]
  });
});

test("list_saved_words filters by level and cuts at the limit", async () => {
  const deps = makeDeps({savedWords: async () => SAVED});
  const known = await run(deps, "list_saved_words", {level: "known"});
  assert.deepEqual(known.words.map((word: any) => word.word), ["f", "b"]);
  assert.equal(known.words[0].level, "known");

  const all = await run(deps, "list_saved_words", {level: "all", limit: 4});
  assert.deepEqual(all.words.map((word: any) => word.word), ["e", "a", "f", "b"]);
  // The totals count everything saved, whatever was asked for.
  assert.deepEqual(all.total, {learning: 3, known: 2});
});

test("list_saved_words uses the remembered language when none is loaded", async () => {
  const requested: string[] = [];
  const result = await run(makeDeps({
    loadedLanguage: () => null,
    rememberedLanguage: async () => VIETNAMESE,
    loadLanguage: failIfCalled("loadLanguage"),
    savedWords: async (code) => { requested.push(code); return {}; }
  }), "list_saved_words");
  assert.deepEqual(requested, ["vi"]);
  assert.deepEqual(result.words, []);
});

// ---- limits and safety -----------------------------------------------------------------------

test("YouTube runs started by tools called together never exceed three at once", async () => {
  let running = 0;
  let most = 0;
  const deps = makeDeps({
    searchYoutube: async () => listing(9),
    videoInfo: async () => {
      most = Math.max(most, ++running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
      return info([], []);
    }
  });
  const tools = createMiteiruTools(deps);
  // Two searches at once; neither finds Japanese, so each checks every result.
  await Promise.all([
    call(tools, "search_videos", {query: "猫", limit: 3}),
    call(tools, "search_videos", {query: "犬", limit: 3})
  ]);
  assert.equal(most, 3);
});

test("rate_video calls made together run one after the other", async () => {
  const events: string[] = [];
  const deps = makeDeps({
    captionText: async (videoId) => {
      events.push(`start ${videoId}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      events.push(`end ${videoId}`);
      return "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n猫\n";
    }
  });
  const tools = createMiteiruTools(deps);
  await Promise.all([
    call(tools, "rate_video", {video: "aaaaaaaaaaa"}),
    call(tools, "rate_video", {video: "bbbbbbbbbbb"})
  ]);
  assert.deepEqual(events, ["start aaaaaaaaaaa", "end aaaaaaaaaaa", "start bbbbbbbbbbb", "end bbbbbbbbbbb"]);
});

test("open_video refuses a start at or past the end, where the video would just end", async () => {
  const {deps, requests} = openDeps();
  await assert.rejects(run(deps, "open_video", {video: "aaaaaaaaaaa", start_at: 600}), toolError(400, "start_at is past the end: the video is 10:00 long."));
  assert.equal(requests.length, 0);
  const {deps: stream} = openDeps({videoInfo: async () => info(["ja"], [], {duration: undefined})});
  assert.equal((await run(stream, "open_video", {video: "aaaaaaaaaaa", start_at: 9999})).opened, true);
});

test("a caption track whose code the download would refuse is never offered or picked", async () => {
  const deps = makeDeps({videoInfo: async () => info(["ja/../../x", "ja-evil*", "en"])});
  await assert.rejects(run(deps, "rate_video", {video: "aaaaaaaaaaa"}), (error: unknown) => {
    assert.ok(error instanceof ToolError);
    assert.equal(error.status, 404);
    assert.match(error.message, /Its captions: en \(English, uploader\)$/);
    return true;
  });
});

test("a tool reports the language the learner loaded while its own load waited", async () => {
  let loaded: LearningLanguage | null = null;
  const result = await run(makeDeps({
    loadedLanguage: () => loaded,
    rememberedLanguage: async () => JAPANESE,
    // The learner's Chinese got in first, so loading the remembered Japanese was skipped.
    loadLanguage: async () => { loaded = MANDARIN; },
    analyze: async () => [{origin: "猫", pinyin: "māo"}]
  }), "analyze_text", {text: "猫"});
  assert.deepEqual(result.language, {code: "zh-CN", name: "Chinese"});
});

test("a katakana word's reading is left out when it only repeats the word in hiragana", async () => {
  const result = await run(makeDeps({
    analyze: async () => [
      {origin: "テレビ", hiragana: "てれび", basicForm: "テレビ", pos: "名詞-一般"},
      {origin: "猫", hiragana: "ねこ", basicForm: "猫", pos: "名詞-一般"}
    ]
  }), "analyze_text", {text: "テレビ猫"});
  assert.deepEqual(result.words.map((word: any) => word.reading), [undefined, "ねこ"]);
});

test("open_video says when the learner turned the video down to keep what they typed", async () => {
  const {deps} = openDeps({openInWindow: async () => "declined", videoInfo: async () => info(["fr"])});
  const result = await run(deps, "open_video", {video: "aaaaaaaaaaa"});
  assert.equal(result.opened, false);
  // Not opened, so nothing about how it opened.
  assert.equal(result.note, "The learner chose to stay on the page they had open, where they had typed something, so the video didn't open.");
});

// ---- answering within the local API's 2 minutes ----------------------------------------------

/** Captions of `count` one-word lines, a second each, every one different. */
const manyLines = (count: number) => "WEBVTT\n\n" + Array.from({length: count}, (_, index) => {
  const time = (seconds: number) => `00:${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}.000`;
  return `${time(index)} --> ${time(index + 1)}\n猫${index}\n`;
}).join("\n");

test("a rating that waited over a minute for the ones ahead of it gives up with a 503", async () => {
  let clock = 0;
  let release: () => void = () => {};
  const tools = createMiteiruTools(makeDeps({
    now: () => clock,
    captionText: async (videoId) => {
      if (videoId === "aaaaaaaaaaa") await new Promise<void>((resolve) => { release = resolve; });
      return manyLines(2);
    }
  }));
  const first = call(tools, "rate_video", {video: "aaaaaaaaaaa"});
  const second = call(tools, "rate_video", {video: "bbbbbbbbbbb"});
  await new Promise((resolve) => setTimeout(resolve, 5));
  clock = 61_000;
  release();
  await first;
  await assert.rejects(second, toolError(503, "Miteiru is still rating other videos. Ask for this one again in a moment."));
});

test("a rating that runs out of time rates the lines it read, and says how much that was", async () => {
  let clock = 0;
  const result = await run(makeDeps({
    now: () => clock,
    videoInfo: async () => info(["ja"], [], {duration: 3600}),
    captionText: async () => manyLines(40),
    // Each batch of 8 lines takes 30 seconds: the third batch starts past the 90-second deadline.
    analyze: async (text) => {
      if (text.endsWith("7") || text.endsWith("15") || text.endsWith("23")) clock += 30_000;
      return [{origin: text, basicForm: text, hiragana: "ねこ", pos: "名詞-一般"}];
    }
  }), "rate_video", {video: "aaaaaaaaaaa"});
  assert.deepEqual(result.captionLines, {rated: 24, total: 40});
  assert.equal(result.words.spoken, 24);
  // 24 words over the 24 seconds read, not over the hour-long video.
  assert.equal(result.wordsPerMinute, 60);
  assert.match(result.note, /^Only the first 24 of 40 caption lines were rated \(up to 0:24\)\. /);
});

test("a rating that can't read a single line in time is a 503", async () => {
  let clock = 0;
  await assert.rejects(run(makeDeps({
    now: () => clock,
    captionText: async () => { clock = 95_000; return manyLines(3); }
  }), "rate_video", {video: "aaaaaaaaaaa"}), toolError(503, "Miteiru took too long to read this video's captions. Ask for it again in a moment."));
});

test("open_video says when a newer call replaced it, since it will never open", async () => {
  const {deps} = openDeps({openInWindow: async () => "replaced"});
  const result = await run(deps, "open_video", {video: "aaaaaaaaaaa"});
  assert.equal(result.opened, false);
  assert.equal(result.note, "Another open_video call came before Miteiru's window took this one, so this video won't open.");
});
