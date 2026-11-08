import assert from "node:assert/strict";
import {afterEach, test} from "node:test";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {Line, SubtitleContainer} from "../renderer/components/Subtitle/DataStructures";
import {PlaybackClock} from "../renderer/utils/playbackClock";
import {YoutubeTranscriptionControl} from "../renderer/components/VideoPlayer/YoutubeTranscriptionControl";
import {ASR_MODELS, DEFAULT_ASR_MODEL} from "../renderer/utils/generateSubtitlesConfig";
import type {BoxTipsResult} from "../main/helpers/boxTips";
import type {YoutubeTranscriptionSegmentResult} from "../renderer/types/youtubeTranscription";
import type {AiUsageSummary} from "../renderer/types/aiUsage";
import {deferred, flushPromises, HookHost, loadHooks} from "./helpers/reactHookHost";

const globals = globalThis as Record<string, any>;
const savedWindow = globals.window;
afterEach(() => {
  if (savedWindow === undefined) delete globals.window;
  else globals.window = savedWindow;
});

const VIDEO = "https://www.youtube.com/watch?v=abcdefghijk";
const OTHER_VIDEO = "https://www.youtube.com/watch?v=lmnopqrstuv";
const TIP = {from: 0, to: 12_000, text: "A useful explanation", kind: "grammar" as const, title: "Sentence ending"};
const DICTIONARY = {surface: "見ている", reading: "みている", meaning: "watching", language: "ja"};
const success: BoxTipsResult = {ok: true, tips: [TIP], dictionaryEntries: [DICTIONARY]};

const installBridge = (settings: Record<string, unknown>, invoke: (channel: string, ...args: any[]) => Promise<any>) => {
  const store = new Map(Object.entries(settings));
  const calls: {channel: string; args: any[]}[] = [];
  const events = new Map<string, Set<(value: any) => void>>();
  globals.window = {
    electronStore: {
      get: async (key: string, fallback: unknown) => store.has(key) ? store.get(key) : fallback,
      set: async (key: string, value: unknown) => { store.set(key, value); }
    },
    backend: {
      invoke: (channel: string, ...args: any[]) => {
        calls.push({channel, args});
        return invoke(channel, ...args);
      },
      on: (channel: string, listener: (value: any) => void) => {
        if (!events.has(channel)) events.set(channel, new Set());
        events.get(channel)!.add(listener);
        return () => { events.get(channel)?.delete(listener); };
      }
    }
  };
  return {store, calls, events, count: (channel: string) => calls.filter((call) => call.channel === channel).length};
};

const subtitle = () => {
  const result = new SubtitleContainer("", "ja");
  result.language = "ja";
  result.lines = [new Line(0, 12_000, "見ている"), new Line(31_000, 45_000, "次を見る"), new Line(300_000, 312_000, "遠くを見る")];
  return result;
};

const forecast = () => {
  const host = new HookHost();
  const {useSubtitleForecast} = loadHooks<typeof import("../renderer/hooks/useSubtitleForecast")>("renderer/hooks/useSubtitleForecast.ts", host);
  const options = {subtitle: subtitle(), lang: "ja", clock: new PlaybackClock(), videoPath: VIDEO, shiftMs: 0};
  const read = () => host.render(() => useSubtitleForecast(options));
  const initialize = async () => { read(); await flushPromises(); return read(); };
  return {host, options, read, initialize};
};

test('forecast does not turn pointer previews into paid requests and resumes after cancellation', async () => {
  const reply = deferred<BoxTipsResult>();
  let generates = 0;
  const bridge = installBridge({'openrouter.apiKey': 'test-key', 'forecast.boxTips': true}, async (channel) => {
    if (channel === 'box-tips:generate') return ++generates === 1 ? reply.promise : success;
    return {ok: true};
  });
  const f = forecast();
  try {
    await f.initialize();
    assert.equal(bridge.count('box-tips:generate'), 1);
    f.options.clock.preview(300);
    f.options.clock.preview(305);
    assert.equal(bridge.count('box-tips:cancel'), 1);
    reply.resolve(success);
    await flushPromises();
    assert.equal(f.read().tips.length, 0);
    assert.equal(bridge.count('box-tips:generate'), 1);
    f.options.clock.cancelPreview();
    await flushPromises();
    assert.equal(bridge.count('box-tips:generate'), 2);
    assert.deepEqual(f.read().tips, [TIP]);
  } finally { f.host.dispose(); }
});

test('forecast context follows the shifted subtitle timeline rather than the raw video time', async () => {
  const bridge = installBridge({'openrouter.apiKey': 'test-key', 'forecast.boxTips': true}, async (channel) => channel === 'box-tips:generate' ? success : {ok: true});
  const f = forecast();
  f.options.shiftMs = 120_000;
  f.options.clock.set(120);
  try {
    await f.initialize();
    const request = bridge.calls.find((call) => call.channel === 'box-tips:generate')!.args[0];
    assert.equal(request.cues[0].from, 0);
    assert.equal(request.cues[0].text, '見ている');
    assert.deepEqual(f.read().tips, [TIP]);
  } finally { f.host.dispose(); }
});

test('changing a running 60-second forecast to 30 seconds preserves the request and reuses its result', async () => {
  const reply = deferred<BoxTipsResult>();
  const bridge = installBridge({'openrouter.apiKey': 'test-key', 'forecast.boxTips': true}, async (channel) => {
    if (channel === 'box-tips:generate') return reply.promise;
    return {ok: true};
  });
  const f = forecast();
  try {
    await f.initialize();
    assert.equal(f.read().busy, true);
    assert.equal(bridge.calls.find((call) => call.channel === 'box-tips:generate')!.args[0].cues.length, 2);
    await f.read().setLookahead(30);
    assert.equal(f.read().lookahead, 30);
    assert.equal(f.read().busy, true, 'changing duration must not reset active request state');
    assert.equal(bridge.count('box-tips:cancel'), 0);
    assert.equal(bridge.count('box-tips:generate'), 1);
    reply.resolve(success);
    await flushPromises();
    assert.deepEqual(f.read().tips, [TIP]);
    assert.equal(f.read().error, '');
    assert.equal(f.read().busy, false);
    f.options.subtitle.notifyChanged();
    await flushPromises();
    assert.equal(bridge.count('box-tips:generate'), 1, 'already prepared larger context covers the shorter batch');
    assert.equal(bridge.count('box-tips:cancel'), 0);
  } finally { f.host.dispose(); }
});

test('changing a running 30-second forecast to 60 seconds queues expanded context serially', async () => {
  const replies = [deferred<BoxTipsResult>(), deferred<BoxTipsResult>()];
  let requests = 0;
  const bridge = installBridge({'openrouter.apiKey': 'test-key', 'forecast.boxTips': true, 'forecast.lookaheadSeconds': 30}, async (channel) => {
    if (channel === 'box-tips:generate') return replies[requests++].promise;
    return {ok: true};
  });
  const f = forecast();
  try {
    await f.initialize();
    await f.read().setLookahead(60);
    f.read();
    assert.equal(requests, 1, 'the duration change must not overlap requests');
    assert.equal(bridge.count('box-tips:cancel'), 0);
    replies[0].resolve(success);
    await flushPromises();
    assert.equal(requests, 2);
    assert.deepEqual(f.read().tips, [TIP], 'existing tips stay visible during the expanded batch');
    assert.equal(bridge.calls.filter((call) => call.channel === 'box-tips:generate')[1].args[0].cues.length, 2);
    replies[1].resolve(success);
    await flushPromises();
    assert.equal(f.read().busy, false);
    assert.equal(f.read().error, '');
  } finally { f.host.dispose(); }
});

const installThirtySecondGrid = (f: ReturnType<typeof forecast>, buckets = 8) => {
  f.options.subtitle.lines = Array.from({length: buckets}, (_, index) =>
    new Line(index * 30_000 + 1000, index * 30_000 + 12_000, `場面${index}`));
};
const requestedCueStarts = (bridge: ReturnType<typeof installBridge>) => bridge.calls
  .filter((call) => call.channel === 'box-tips:generate').map((call) => call.args[0].cues[0].from);

test('30-second mode prepares current, next and previous buckets serially and reuses their history', async () => {
  const replies = Array.from({length: 4}, () => deferred<BoxTipsResult>());
  let requests = 0;
  let active = 0;
  let maximumActive = 0;
  const bridge = installBridge({'openrouter.apiKey': 'test-key', 'forecast.boxTips': true, 'forecast.lookaheadSeconds': 30}, async (channel) => {
    if (channel !== 'box-tips:generate') return {ok: true};
    maximumActive = Math.max(maximumActive, ++active);
    try { return await replies[requests++].promise; }
    finally { active--; }
  });
  const f = forecast();
  installThirtySecondGrid(f);
  f.options.clock.set(95);
  try {
    await f.initialize();
    assert.deepEqual(requestedCueStarts(bridge), [91_000], 'prepare the current cue before a neighbour');
    replies[0].resolve({ok: true, tips: []});
    await flushPromises();
    assert.deepEqual(requestedCueStarts(bridge), [91_000, 121_000]);
    replies[1].resolve({ok: true, tips: []});
    await flushPromises();
    assert.deepEqual(requestedCueStarts(bridge), [91_000, 121_000, 61_000]);
    replies[2].resolve({ok: true, tips: []});
    await flushPromises();
    assert.equal(f.read().busy, false);
    assert.equal(maximumActive, 1);
    f.options.clock.set(125);
    await flushPromises();
    assert.deepEqual(requestedCueStarts(bridge), [91_000, 121_000, 61_000, 151_000], 'only the new next bucket needs preparation');
    replies[3].resolve({ok: true, tips: []});
    await flushPromises();
    f.options.clock.set(95);
    f.options.subtitle.notifyChanged();
    await flushPromises();
    assert.equal(requests, 4, 'seeking back reuses all three prepared neighbours');
  } finally { f.host.dispose(); }
});

test('30-second mode omits negative and empty end buckets', async () => {
  const bridge = installBridge({'openrouter.apiKey': 'test-key', 'forecast.boxTips': true, 'forecast.lookaheadSeconds': 30}, async (channel) =>
    channel === 'box-tips:generate' ? {ok: true, tips: []} : {ok: true});
  const f = forecast();
  installThirtySecondGrid(f, 6);
  try {
    await f.initialize();
    await flushPromises();
    assert.deepEqual(requestedCueStarts(bridge), [1000, 31_000]);
    f.options.clock.set(155);
    await flushPromises();
    assert.deepEqual(requestedCueStarts(bridge), [1000, 31_000, 151_000, 121_000]);
    assert.equal(bridge.calls.filter((call) => call.channel === 'box-tips:generate')
      .every((call) => call.args[0].cues.every((cue) => cue.from >= 0 && cue.to - cue.from <= 30_000)), true);
  } finally { f.host.dispose(); }
});

test('30-second neighbours rebuild around the committed seek and ignore obsolete in-flight tips', async () => {
  const first = deferred<BoxTipsResult>();
  let requests = 0;
  const bridge = installBridge({'openrouter.apiKey': 'test-key', 'forecast.boxTips': true, 'forecast.lookaheadSeconds': 30}, async (channel) => {
    if (channel === 'box-tips:generate') return ++requests === 1 ? first.promise : {ok: true, tips: []};
    return {ok: true};
  });
  const f = forecast();
  installThirtySecondGrid(f, 10);
  f.options.clock.set(95);
  try {
    await f.initialize();
    f.options.clock.preview(205);
    f.options.clock.preview(207);
    assert.equal(bridge.count('box-tips:cancel'), 1);
    assert.equal(requests, 1, 'dragging does not start work for the previewed buckets');
    f.options.clock.commitPreview(205);
    first.resolve({ok: true, tips: [{...TIP, from: 91_000, to: 102_000, title: 'Old cue'}]});
    await flushPromises();
    await flushPromises();
    assert.deepEqual(requestedCueStarts(bridge), [91_000, 181_000, 211_000, 151_000]);
    assert.deepEqual(f.read().tips, [], 'the obsolete cue cannot become a prepared marker');
    assert.equal(f.read().error, '');
  } finally { f.host.dispose(); }
});

test('prepared tips remain available for timeline markers and seeking back after later batches', async () => {
  const later = {...TIP, from: 300_000, to: 312_000, title: 'Later tip'};
  const bridge = installBridge({'openrouter.apiKey': 'test-key', 'forecast.boxTips': true}, async (channel, request) => {
    if (channel === 'box-tips:generate') return {...success, tips: request.cues[0].from >= 300_000 ? [later] : [TIP]};
    return {ok: true};
  });
  const f = forecast();
  try {
    await f.initialize();
    f.options.clock.set(300);
    await flushPromises();
    assert.deepEqual(f.read().tips, [TIP, later]);
    f.options.clock.set(0);
    await flushPromises();
    assert.deepEqual(f.read().tips, [TIP, later]);
    assert.equal(bridge.count('box-tips:generate'), 2, 'seeking back reuses prepared notes');
  } finally { f.host.dispose(); }
});

test('prepared tip history survives other AI settings and rejects non-English cached bodies', async () => {
  const next = deferred<BoxTipsResult>();
  let requests = 0;
  installBridge({'openrouter.apiKey': 'test-key', 'forecast.boxTips': true}, async (channel) => {
    if (channel === 'box-tips:generate') return ++requests === 1
      ? {...success, tips: [TIP, {...TIP, from: 31_000, to: 45_000, text: '这个表达表示重要的场合。'}]}
      : next.promise;
    return {ok: true};
  });
  const f = forecast();
  try {
    await f.initialize();
    assert.deepEqual(f.read().tips, [TIP], 'a marker must correspond to an English card');
    await f.read().setDictionaryEnabled(true);
    assert.deepEqual(f.read().tips, [TIP], 'dictionary changes must not erase prepared tip history');
    f.options.shiftMs = 1000;
    assert.deepEqual(f.read().tips, [TIP], 'shifting playback must retain subtitle-time markers');
    await f.read().setTipsEnabled(false);
    f.read();
    await f.read().setTipsEnabled(true);
    assert.deepEqual(f.read().tips, [TIP], 'turning tips back on can immediately reuse prepared notes');
    next.resolve({ok: true, tips: []});
    await flushPromises();
  } finally { f.host.dispose(); }
});

test("forecast defaults make no paid requests, and one enabled batch survives word-analysis notifications", async () => {
  const bridge = installBridge({"openrouter.apiKey": "test-key"}, async (channel) => {
    if (channel === "box-tips:generate") return success;
    return {ok: true};
  });
  const f = forecast();
  try {
    assert.equal((await f.initialize()).tipsEnabled, false);
    assert.equal(f.read().dictionaryEnabled, false);
    f.options.clock.set(31);
    f.options.subtitle.notifyChanged();
    assert.equal(bridge.count("box-tips:generate"), 0);
    f.options.clock.set(0);
    await f.read().setTipsEnabled(true);
    f.read();
    await flushPromises();
    assert.equal(f.read().tips.length, 1);
    assert.equal(bridge.count("box-tips:generate"), 1);
    for (let i = 0; i < 5; i++) {
      f.options.subtitle.lines[0].content = [{origin: "見ている", basicForm: "見る", hiragana: "みている"}];
      f.options.subtitle.notifyChanged();
      f.options.clock.set(i + 1);
    }
    await flushPromises();
    assert.equal(bridge.count("box-tips:generate"), 1);
    assert.equal(bridge.count("user-dictionary:upsert"), 0);
    const request = bridge.calls.find((call) => call.channel === "box-tips:generate")!.args[0];
    assert.equal(request.includeTips, true);
    assert.equal(request.includeDictionary, false);
    assert.equal(request.cues[0].text, "見ている");
  } finally { f.host.dispose(); }
});

test("one forecast response supplies tips and persistent dictionary additions marked as AI", async () => {
  const bridge = installBridge({"openrouter.apiKey": "test-key", "forecast.boxTips": true, "userDictionary.enabled": true}, async (channel) => {
    if (channel === "box-tips:generate") return success;
    return {ok: true};
  });
  const f = forecast();
  try {
    await f.initialize();
    await flushPromises();
    assert.equal(bridge.count("box-tips:generate"), 1);
    assert.equal(bridge.count("user-dictionary:upsert"), 1);
    assert.deepEqual(bridge.calls.find((call) => call.channel === "user-dictionary:upsert")!.args, [[{...DICTIONARY, source: "ai"}]]);
    assert.equal("source" in DICTIONARY, false);
    assert.deepEqual(f.read().tips, [TIP]);
  } finally { f.host.dispose(); }
});

test('AI word splits and contextual meanings become available after missing entries are saved', async () => {
  const stored = deferred<{ok: boolean}>();
  const analysis = {from: 0, to: 12_000, text: '星詠み', tokens: [{origin: '星詠み', basicForm: '星詠み', hiragana: 'ほしよみ', contextMeaning: 'star reader', separation: [{main: '星詠み', hiragana: 'ほしよみ'}]}]};
  const missing = {surface: '星詠み', reading: 'ほしよみ', meaning: 'divination by the stars', language: 'ja'};
  const bridge = installBridge({'openrouter.apiKey': 'test-key', 'userDictionary.enabled': true}, async (channel) => {
    if (channel === 'box-tips:generate') return {ok: true, tips: [], dictionaryEntries: [missing], retokenizations: [analysis]};
    if (channel === 'user-dictionary:upsert') return stored.promise;
    return {ok: true};
  });
  const f = forecast();
  f.options.subtitle.lines[0] = new Line(0, 12_000, '星詠み');
  try {
    await f.initialize();
    assert.equal(bridge.count('user-dictionary:upsert'), 1);
    assert.deepEqual(f.read().retokenizations, [], 'a new word cannot be clicked before its fallback exists');
    stored.resolve({ok: true});
    await flushPromises();
    assert.deepEqual(f.read().retokenizations, [analysis]);
    assert.equal(f.read().retokenizations[0].tokens[0].contextMeaning, 'star reader');
    assert.deepEqual(bridge.calls.find((call) => call.channel === 'user-dictionary:upsert')!.args, [[{...missing, source: 'ai'}]]);
  } finally { f.host.dispose(); }
});

test('AI can correct known-word boundaries and contextual meanings without adding dictionary entries', async () => {
  const analysis = {from: 0, to: 12_000, text: '見ている', tokens: [{origin: '見ている', basicForm: '見る', contextMeaning: 'is watching', hiragana: 'みている', separation: [{main: '見', hiragana: 'み'}, {main: 'ている'}]}]};
  const bridge = installBridge({'openrouter.apiKey': 'test-key', 'userDictionary.enabled': true}, async (channel) => {
    if (channel === 'box-tips:generate') return {ok: true, tips: [], dictionaryEntries: [], retokenizations: [analysis]};
    return {ok: true};
  });
  const f = forecast();
  try {
    await f.initialize();
    assert.deepEqual(f.read().retokenizations, [analysis]);
    assert.equal(bridge.count('user-dictionary:upsert'), 0);
  } finally { f.host.dispose(); }
});

test("disabling forecast ignores its late tips and dictionary suggestions", async () => {
  const reply = deferred<BoxTipsResult>();
  const bridge = installBridge({"openrouter.apiKey": "test-key", "forecast.boxTips": true, "userDictionary.enabled": true}, async (channel) => {
    if (channel === "box-tips:generate") return reply.promise;
    return {ok: true};
  });
  const f = forecast();
  try {
    await f.initialize();
    assert.equal(bridge.count("box-tips:generate"), 1);
    const enabled = f.read();
    await enabled.setTipsEnabled(false);
    await enabled.setDictionaryEnabled(false);
    f.read();
    assert.equal(bridge.count("box-tips:cancel"), 1);
    reply.resolve(success);
    await flushPromises();
    assert.deepEqual(f.read().tips, []);
    assert.equal(bridge.count("user-dictionary:upsert"), 0);
    f.options.clock.set(31);
    f.options.subtitle.notifyChanged();
    assert.equal(bridge.count("box-tips:generate"), 1);
  } finally { f.host.dispose(); }
});

test("switching videos discards the previous forecast response", async () => {
  const first = deferred<BoxTipsResult>();
  const second = deferred<BoxTipsResult>();
  let requests = 0;
  installBridge({"openrouter.apiKey": "test-key", "forecast.boxTips": true}, async (channel) => {
    if (channel === "box-tips:generate") return ++requests === 1 ? first.promise : second.promise;
    return {ok: true};
  });
  const f = forecast();
  try {
    await f.initialize();
    f.options.videoPath = OTHER_VIDEO;
    f.options.subtitle = subtitle();
    f.read();
    assert.equal(requests, 2);
    first.resolve(success);
    await flushPromises();
    assert.deepEqual(f.read().tips, []);
    second.resolve({...success, tips: [{...TIP, title: "Current video"}]});
    await flushPromises();
    assert.equal(f.read().tips[0].title, "Current video");
  } finally { f.host.dispose(); }
});

test("seeking far away ignores the old forecast and seeking back can request that window again", async () => {
  const replies = [deferred<BoxTipsResult>(), deferred<BoxTipsResult>(), deferred<BoxTipsResult>()];
  let requests = 0;
  const bridge = installBridge({"openrouter.apiKey": "test-key", "forecast.boxTips": true}, async (channel) => {
    if (channel === "box-tips:generate") return replies[requests++].promise;
    return {ok: true};
  });
  const f = forecast();
  try {
    await f.initialize();
    f.options.clock.set(300);
    assert.equal(bridge.count("box-tips:cancel"), 1);
    replies[0].resolve(success);
    await flushPromises();
    assert.deepEqual(f.read().tips, []);
    assert.equal(requests, 2);
    replies[1].resolve({ok: true, tips: []});
    await flushPromises();
    f.options.clock.set(0);
    assert.equal(requests, 3);
    replies[2].resolve(success);
    await flushPromises();
    assert.equal(f.read().tips[0].title, TIP.title);
  } finally { f.host.dispose(); }
});

test("a forecast failure halts paid requests until explicit retry", async () => {
  let requests = 0;
  const bridge = installBridge({"openrouter.apiKey": "test-key", "forecast.boxTips": true}, async (channel) => {
    if (channel === "box-tips:generate") return ++requests === 1 ? {ok: false, error: "Rate limited", tips: []} : success;
    return {ok: true};
  });
  const f = forecast();
  try {
    await f.initialize();
    await flushPromises();
    assert.equal(f.read().error, "Rate limited");
    f.options.clock.set(31);
    f.options.subtitle.notifyChanged();
    await flushPromises();
    assert.equal(bridge.count("box-tips:generate"), 1);
    f.read().retry();
    f.read();
    await flushPromises();
    assert.equal(bridge.count("box-tips:generate"), 2);
    assert.equal(f.read().error, "");
  } finally { f.host.dispose(); }
});

const validForecastAnalysis = {
  from: 0, to: 12_000, text: '見ている',
  tokens: [{origin: '見ている', basicForm: '見る', hiragana: 'みている', contextMeaning: 'is watching',
    separation: [{main: '見', hiragana: 'み'}, {main: 'ている'}]}]
};
const otherForecastTip = {...TIP, from: 300_000, to: 312_000, title: 'Later cue'};
const malformedForecastReplies: {name: string; value: unknown}[] = [
  {name: 'null result', value: null},
  {name: 'numeric root', value: 42},
  {name: 'array root', value: []},
  {name: 'non-boolean success flag', value: {ok: 'yes', tips: []}},
  {name: 'null tip', value: {ok: true, tips: [null]}},
  {name: 'object tip title', value: {ok: true, tips: [{...otherForecastTip, title: {bad: true}}]}},
  {name: 'object tip explanation', value: {ok: true, tips: [{...otherForecastTip, text: {bad: true}}]}},
  {name: 'object token separation', value: {ok: true, tips: [otherForecastTip], retokenizations: [{...validForecastAnalysis,
    tokens: [{...validForecastAnalysis.tokens[0], separation: {bad: true}}]}]}},
  {name: 'object token dictionary form', value: {ok: true, tips: [otherForecastTip], retokenizations: [{...validForecastAnalysis,
    tokens: [{...validForecastAnalysis.tokens[0], basicForm: {bad: true}}]}]}},
  {name: 'object dictionary collection', value: {ok: true, tips: [otherForecastTip], dictionaryEntries: {bad: true}}},
  {name: 'object dictionary meaning', value: {ok: true, tips: [otherForecastTip], dictionaryEntries: [{...DICTIONARY, meaning: {bad: true}}]}},
  {name: 'object failure detail', value: {ok: false, tips: [], error: {message: 'Bad model response'}}}
];

for (const malformed of malformedForecastReplies) {
  test(`malformed ${malformed.name} preserves prepared learning state and halts paid retries`, async () => {
    let requests = 0;
    const first: BoxTipsResult = {ok: true, tips: [TIP], dictionaryEntries: [], retokenizations: [validForecastAnalysis]};
    const bridge = installBridge({'openrouter.apiKey': 'test-key', 'forecast.boxTips': true, 'userDictionary.enabled': true}, async (channel) => {
      if (channel !== 'box-tips:generate') return {ok: true};
      requests++;
      return requests === 1 ? first : requests === 2 ? malformed.value : {ok: true, tips: [], dictionaryEntries: [], retokenizations: []};
    });
    const f = forecast();
    f.options.subtitle.lines.push(new Line(600_000, 612_000, 'さらに見る'));
    try {
      await f.initialize();
      assert.deepEqual(f.read().tips, [TIP]);
      assert.deepEqual(f.read().retokenizations, [validForecastAnalysis]);
      f.options.clock.set(300);
      await flushPromises();
      const failed = f.read();
      assert.equal(typeof failed.error, 'string');
      assert.ok(failed.error.trim(), 'bad backend data should produce a readable error');
      assert.equal(failed.busy, false);
      assert.deepEqual(failed.tips, [TIP], 'validation must finish before changing the tip list');
      assert.deepEqual(failed.retokenizations, [validForecastAnalysis], 'malformed tokens must not replace usable analysis');
      assert.equal(bridge.count('user-dictionary:upsert'), 0, 'invalid additions must never be persisted');
      f.options.clock.set(600);
      f.options.subtitle.notifyChanged();
      await flushPromises();
      assert.equal(requests, 2, 'even a new unprepared window cannot restart failed paid work automatically');
      f.read().retry();
      f.read();
      await flushPromises();
      assert.equal(requests, 3);
      assert.equal(f.read().error, '');
      assert.equal(bridge.count('user-dictionary:upsert'), 0);
    } finally { f.host.dispose(); }
  });
}

const transcription = () => {
  const host = new HookHost();
  const {useYoutubeTranscription} = loadHooks<typeof import("../renderer/hooks/useYoutubeTranscription")>("renderer/hooks/useYoutubeTranscription.ts", host);
  const listeners = new Map<string, Set<() => void>>();
  let paused = true;
  const tokenizeCalls: string[] = [];
  const frequencies: Map<string, number>[] = [];
  const options = {
    videoPath: VIDEO, openedVideo: {}, lang: "ja", clock: new PlaybackClock(),
    player: {
      paused: () => paused, duration: () => 600,
      on: (event: string, listener: () => void) => {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(listener);
      },
      off: (event: string, listener: () => void) => { listeners.get(event)?.delete(listener); }
    },
    primarySub: new SubtitleContainer(),
    setPrimarySub: (sub: SubtitleContainer) => { options.primarySub = sub; },
    tokenizeMiteiru: async (text: string) => {
      tokenizeCalls.push(text);
      return [{origin: text, basicForm: text, hiragana: "よみ"}];
    },
    forceSimplified: true,
    setFrequencyPrimary: (frequency: Map<string, number>) => { frequencies.push(frequency); }
  };
  const read = () => host.render(() => useYoutubeTranscription(options));
  const initialize = async () => { read(); await flushPromises(); return read(); };
  const play = () => { paused = false; listeners.get("play")?.forEach((listener) => listener()); };
  return {host, options, read, initialize, tokenizeCalls, frequencies, listeners, play};
};

const settleAnalysis = async () => {
  await flushPromises();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushPromises();
};
const cue = (id: string, from: number, text: string) => ({id, from, to: from + 1500, text});

test("generated subtitles are off by default and opening their controls makes no paid call", async () => {
  const bridge = installBridge({"openrouter.apiKey": "test-key"}, async () => ({ok: true, entries: []}));
  const f = transcription();
  try {
    assert.equal((await f.initialize()).enabled, false);
    f.read().open();
    f.read();
    f.options.clock.set(100);
    f.play();
    await flushPromises();
    assert.equal(f.read().isOpen, true);
    assert.equal(bridge.count("youtube-transcription:segment"), 0);
  } finally { f.host.dispose(); }
});

test("generated segments append in one container and reuse tokenized lines and frequency counts", async () => {
  const first = deferred<YoutubeTranscriptionSegmentResult>();
  const second = deferred<YoutubeTranscriptionSegmentResult>();
  let requests = 0;
  const bridge = installBridge({"openrouter.apiKey": "test-key"}, async (channel, payload) => {
    if (channel === "youtube-transcription:segment") return ++requests === 1 ? first.promise : second.promise;
    if (channel === "learningGlossesJapanese") return payload.map(() => "gloss");
    return {ok: true};
  });
  const f = transcription();
  try {
    await f.initialize();
    f.read().start();
    f.read();
    await flushPromises();
    const container = f.options.primarySub;
    first.resolve({ok: true, entries: [cue("first", 1000, "最初")]});
    await settleAnalysis();
    const line = container.lines[0];
    const tokens = line.content;
    assert.ok(Array.isArray(tokens));
    assert.equal(container.frequency.get("最初"), 1);
    f.options.clock.set(31);
    await flushPromises();
    second.resolve({ok: true, entries: [cue("second", 31_000, "続き")]});
    await settleAnalysis();
    assert.equal(f.options.primarySub, container);
    assert.equal(container.lines.length, 2);
    assert.equal(container.lines[0], line);
    assert.equal(container.lines[0].content, tokens);
    assert.deepEqual(f.tokenizeCalls, ["最初", "続き"]);
    assert.equal(container.frequency.get("最初"), 1);
    assert.equal(container.frequency.get("続き"), 1);
    f.options.clock.set(1);
    await flushPromises();
    assert.equal(bridge.count("youtube-transcription:segment"), 2);
    assert.equal(f.read().state.completedSegments, 2);
  } finally { f.host.dispose(); }
});

for (const replacement of ["video", "manual subtitle"] as const) {
  test(`switching ${replacement} stops generated subtitles and ignores late segment results`, async () => {
    const reply = deferred<YoutubeTranscriptionSegmentResult>();
    const bridge = installBridge({"openrouter.apiKey": "test-key"}, async (channel) => {
      if (channel === "youtube-transcription:segment") return reply.promise;
      return {ok: true};
    });
    const f = transcription();
    try {
      await f.initialize();
      f.read().start();
      f.read();
      await flushPromises();
      const generated = f.options.primarySub;
      if (replacement === "video") {
        f.options.videoPath = OTHER_VIDEO;
        f.options.openedVideo = {};
      } else {
        f.options.primarySub = subtitle();
      }
      f.read();
      assert.equal(f.read().enabled, false);
      assert.equal(bridge.count("youtube-transcription:cancel"), 1);
      reply.resolve({ok: true, entries: [cue("stale", 1000, "古い") ]});
      await settleAnalysis();
      assert.equal(generated.lines.length, 0);
      assert.deepEqual(f.tokenizeCalls, []);
      f.options.clock.set(61);
      f.play();
      await flushPromises();
      assert.equal(bridge.count("youtube-transcription:segment"), 1);
      assert.equal([...f.listeners.values()].reduce((count, set) => count + set.size, 0), 0);
    } finally { f.host.dispose(); }
  });
}

test("a transcription error does not repeatedly charge on clock changes and explicit retry recovers", async () => {
  let requests = 0;
  const bridge = installBridge({"openrouter.apiKey": "test-key"}, async (channel) => {
    if (channel === "youtube-transcription:segment") return ++requests === 1 ? {ok: false, error: "Transcription failed"} : {ok: true, entries: []};
    return {ok: true};
  });
  const f = transcription();
  try {
    await f.initialize();
    f.read().start();
    f.read();
    await flushPromises();
    assert.equal(f.read().state.error, "Transcription failed");
    f.options.clock.set(31);
    f.options.clock.set(61);
    await flushPromises();
    assert.equal(bridge.count("youtube-transcription:segment"), 1);
    f.read().retry();
    await flushPromises();
    assert.equal(bridge.count("youtube-transcription:segment"), 2);
    assert.equal(f.read().state.error, null);
    assert.equal(f.read().state.completedSegments, 1);
  } finally { f.host.dispose(); }
});

test("live cost events update the UI and an older initial reply cannot roll the total back", async () => {
  const initial = deferred<AiUsageSummary>();
  const bridge = installBridge({}, async (channel) => {
    assert.equal(channel, "ai-usage:get");
    return initial.promise;
  });
  const host = new HookHost();
  const {useAiUsage} = loadHooks<typeof import("../renderer/hooks/useAiUsage")>("renderer/hooks/useAiUsage.ts", host);
  const read = () => host.render(useAiUsage);
  try {
    assert.equal(read(), null);
    const latest = {observedCostUsd: 0.125, totalRequests: 2, unpricedRequests: 1};
    bridge.events.get("ai-usage:changed")!.forEach((listener) => listener(latest));
    assert.deepEqual(read(), latest);
    initial.resolve({observedCostUsd: 0, totalRequests: 0, unpricedRequests: 0});
    await flushPromises();
    assert.deepEqual(read(), latest);
  } finally { host.dispose(); }
  assert.equal(bridge.events.get("ai-usage:changed")!.size, 0);
});

test("generated-subtitle controls disclose paid batches, disable keyless start and expose retry after errors", () => {
  const props = {
    isOpen: true, onClose() {}, onStart() {}, onStop() {}, onRetry() {}, enabled: false,
    state: {activeSegment: null, completedSegments: 0, bufferedUntilSeconds: 0, error: null},
    hasApiKey: false, asrModel: DEFAULT_ASR_MODEL, setAsrModel() {}, asrModelOptions: ASR_MODELS
  };
  const off = renderToStaticMarkup(React.createElement(YoutubeTranscriptionControl, props));
  assert.match(off, /Subtitles from the audio/);
  assert.match(off, /Each 30-second piece is one paid request/);
  assert.match(off, /Add your OpenRouter key in Settings → AI\./);
  assert.match(off, /disabled=""[^>]*>Start from here/);
  assert.match(off, /Keep watching/);
  assert.doesNotMatch(off, /Try this piece again/);
  const failed = renderToStaticMarkup(React.createElement(YoutubeTranscriptionControl, {...props, enabled: true, hasApiKey: true, state: {...props.state, error: "Network failed"}}));
  assert.match(failed, /Try this piece again/);
  assert.match(failed, />Stop</);
  assert.match(failed, /Network failed/);
});
