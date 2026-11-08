import assert from "node:assert/strict";
import {test} from "node:test";
import {Line, SubtitleContainer} from "../renderer/components/Subtitle/DataStructures";
import {fillLineWithLearningContent, fillSubtitleWithLearningContent, releaseLearningLines, SubtitleRetokenizer} from "../renderer/components/Subtitle/subtitleLanguageSupport";

const token = (word: string, customMeaning?: string) => ({origin: word, basicForm: word, hiragana: "", ...(customMeaning ? {userDictionaryMeaning: customMeaning} : {})});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return {promise, resolve};
};
const subtitleOf = (texts: string[]) => {
  const subtitle = new SubtitleContainer();
  subtitle.language = "ja";
  subtitle.lines = texts.map((text, index) => new Line(index * 1000, index * 1000 + 800, text));
  return subtitle;
};
const withGlosses = async (run: () => Promise<void>, invoke = async (_channel: string, batch: {target: string}[]) => batch.map(({target}) => `gloss:${target}`)) => {
  const globals = globalThis as Record<string, unknown>;
  const saved = globals.window;
  globals.window = {backend: {invoke}};
  try { await run(); } finally {
    if (saved === undefined) delete globals.window;
    else globals.window = saved;
  }
};

test("installing a retokenizer does no initial duplicate analysis and empty/unrelated surfaces do no work", async () => {
  await withGlosses(async () => {
    const subtitle = subtitleOf(["first", "second"]);
    let calls = 0;
    const tokenize = async (text: string) => { calls++; return [token(text)]; };
    const refresh = new SubtitleRetokenizer({subtitle, tokenizeMiteiru: tokenize, getPlaybackTimeMs: () => 0});
    await refresh.whenIdle();
    assert.equal(calls, 0);
    await fillSubtitleWithLearningContent(subtitle, tokenize);
    refresh.refresh([]);
    refresh.refresh(["absent"]);
    await refresh.whenIdle();
    assert.equal(calls, 2);
    refresh.dispose();
  });
});

test("only affected cues refresh, near playback first, and frequency counts change once", async () => {
  await withGlosses(async () => {
    const subtitle = subtitleOf(["term past", "unaffected", "term current", "term next"]);
    await fillSubtitleWithLearningContent(subtitle, async () => [token("old")]);
    const order: string[] = [];
    const untouched = subtitle.lines[1].content;
    const refresh = new SubtitleRetokenizer({
      subtitle,
      tokenizeMiteiru: async (text) => { order.push(text); return [token("new", "custom definition")]; },
      getPlaybackTimeMs: () => 2100
    });
    refresh.refresh(["term"]);
    await refresh.whenIdle();
    assert.deepEqual(order, ["term current", "term next", "term past"]);
    assert.equal(subtitle.lines[1].content, untouched);
    assert.equal(subtitle.frequency.get("old"), 1);
    assert.equal(subtitle.frequency.get("new"), 3);
    assert.deepEqual(subtitle.lines[2].meaning, ["custom definition"]);
    refresh.refresh(["term"]);
    await refresh.whenIdle();
    assert.equal(subtitle.frequency.get("new"), 3, "repeated refreshes replace each line's contribution");
    const calls = order.length;
    await fillSubtitleWithLearningContent(subtitle, async (text) => { order.push(text); return [token("wrong")]; });
    assert.equal(order.length, calls, "ordinary analysis does not redo already-ready refreshed lines");
    assert.equal(subtitle.frequency.has("wrong"), false);
    refresh.dispose();
  });
});

test("a dictionary refresh wins over an older initial-analysis request that completes later", async () => {
  await withGlosses(async () => {
    const subtitle = subtitleOf(["term"]);
    const oldReply = deferred<any[]>();
    const oldStarted = deferred<void>();
    let calls = 0;
    const tokenize = async () => {
      if (++calls === 1) { oldStarted.resolve(); return oldReply.promise; }
      return [token("new", "new dictionary meaning")];
    };
    const initial = fillSubtitleWithLearningContent(subtitle, tokenize);
    await oldStarted.promise;
    const refresh = new SubtitleRetokenizer({subtitle, tokenizeMiteiru: tokenize, getPlaybackTimeMs: () => 0});
    refresh.refresh(["term"]);
    await refresh.whenIdle();
    assert.deepEqual(subtitle.lines[0].meaning, ["new dictionary meaning"]);
    oldReply.resolve([token("old")]);
    await initial;
    assert.equal((subtitle.lines[0].content as any[])[0].origin, "new");
    assert.deepEqual([...subtitle.frequency], [["new", 1]]);
    refresh.dispose();
  });
});

test("old tokens and glosses remain visible until the replacement glosses are ready", async () => {
  const newGlosses = deferred<string[]>();
  const glossStarted = deferred<void>();
  await withGlosses(async () => {
    const subtitle = subtitleOf(["term"]);
    await fillSubtitleWithLearningContent(subtitle, async () => [token("old")]);
    const oldTokens = subtitle.lines[0].content;
    const oldMeanings = subtitle.lines[0].meaning;
    const refresh = new SubtitleRetokenizer({subtitle, tokenizeMiteiru: async () => [token("new")], getPlaybackTimeMs: () => 0});
    refresh.refresh(["term"]);
    await glossStarted.promise;
    assert.equal(subtitle.lines[0].content, oldTokens);
    assert.equal(subtitle.lines[0].meaning, oldMeanings);
    assert.deepEqual([...subtitle.frequency], [["old", 1]]);
    newGlosses.resolve(["new gloss"]);
    await refresh.whenIdle();
    assert.equal((subtitle.lines[0].content as any[])[0].origin, "new");
    assert.deepEqual(subtitle.lines[0].meaning, ["new gloss"]);
    assert.deepEqual([...subtitle.frequency], [["new", 1]]);
    refresh.dispose();
  }, async (_channel, batch) => {
    if (batch[0].target === "new") { glossStarted.resolve(); return newGlosses.promise; }
    return batch.map(({target}) => `gloss:${target}`);
  });
});

test("disposal cancels stale replacement writes and leaves existing frequencies intact", async () => {
  await withGlosses(async () => {
    const subtitle = subtitleOf(["term"]);
    await fillSubtitleWithLearningContent(subtitle, async () => [token("old")]);
    const reply = deferred<any[]>();
    const started = deferred<void>();
    const before = subtitle.lines[0].content;
    let announcements = 0;
    const refresh = new SubtitleRetokenizer({
      subtitle, getPlaybackTimeMs: () => 0,
      tokenizeMiteiru: async () => { started.resolve(); return reply.promise; },
      onChanged: () => announcements++
    });
    refresh.refresh(["term"]);
    await started.promise;
    refresh.dispose();
    reply.resolve([token("new")]);
    await refresh.whenIdle();
    assert.equal(subtitle.lines[0].content, before);
    assert.deepEqual([...subtitle.frequency], [["old", 1]]);
    assert.equal(announcements, 0);
  });
});

test("new changes merge into a running queue without dropping a previously affected surface", async () => {
  await withGlosses(async () => {
    const subtitle = subtitleOf(["alpha", "beta"]);
    const reply = deferred<any[]>();
    const started = deferred<void>();
    let alphaCalls = 0;
    const refresh = new SubtitleRetokenizer({
      subtitle, getPlaybackTimeMs: () => 0,
      tokenizeMiteiru: async (text) => {
        if (text === "alpha" && ++alphaCalls === 1) { started.resolve(); return reply.promise; }
        return [token(text, `custom:${text}`)];
      }
    });
    refresh.refresh(["alpha"]);
    await started.promise;
    refresh.refresh(["beta"]);
    refresh.refresh(["alpha"]);
    reply.resolve([token("stale alpha")]);
    await refresh.whenIdle();
    assert.equal((subtitle.lines[0].content as any[])[0].origin, "alpha");
    assert.equal((subtitle.lines[1].content as any[])[0].origin, "beta");
    assert.deepEqual([...subtitle.frequency].sort(), [["alpha", 1], ["beta", 1]]);
    refresh.dispose();
  });
});

test("single-line reanalysis uses the original text, replaces frequency counts, and prefers dictionary meanings", async () => {
  let glossCalls = 0;
  await withGlosses(async () => {
    const subtitle = subtitleOf(["original text"]);
    const line = subtitle.lines[0];
    const texts: string[] = [];
    await fillLineWithLearningContent(line, "ja", async (text) => { texts.push(text); return [token("old")]; }, subtitle.frequency);
    await fillLineWithLearningContent(line, "ja", async (text) => { texts.push(text); return [token("new", "custom meaning")]; }, subtitle.frequency);
    assert.deepEqual(texts, ["original text", "original text"]);
    assert.deepEqual(line.meaning, ["custom meaning"]);
    assert.equal(glossCalls, 1, "user dictionary meanings skip the built-in gloss lookup");
    assert.deepEqual([...subtitle.frequency], [["new", 1]]);
  }, async (_channel, batch) => { glossCalls++; return batch.map(() => "builtin"); });
});

test("replacing merged transcript cues releases old counts and prevents queued removed lines from returning", async () => {
  await withGlosses(async () => {
    const subtitle = subtitleOf(["original", "retained"]);
    await fillSubtitleWithLearningContent(subtitle, async () => [token("counted")]);
    const removed = subtitle.lines[0];
    const replacement = new Line(0, 900, "replacement");
    releaseLearningLines([removed], subtitle.frequency);
    subtitle.lines = [replacement, subtitle.lines[1]];
    const present = new Set(subtitle.lines);
    const queued = subtitleOf([]);
    queued.lines = [removed, replacement];
    queued.frequency = subtitle.frequency;
    await fillSubtitleWithLearningContent(queued, async (text) => [token(text)], () => true, () => 0, (line) => present.has(line));
    assert.deepEqual([...subtitle.frequency].sort(), [["counted", 1], ["replacement", 1]]);
    releaseLearningLines([removed], subtitle.frequency);
    assert.equal(subtitle.frequency.get("counted"), 1, "releasing the same removed line twice is harmless");
  });
});

test("a dictionary refresh cannot commit a removed cue or change its released frequency counts", async () => {
  await withGlosses(async () => {
    const subtitle = subtitleOf(["term"]);
    await fillSubtitleWithLearningContent(subtitle, async () => [token("old")]);
    const reply = deferred<any[]>();
    const started = deferred<void>();
    const refresh = new SubtitleRetokenizer({
      subtitle, getPlaybackTimeMs: () => 0,
      tokenizeMiteiru: async () => { started.resolve(); return reply.promise; }
    });
    refresh.refresh(["term"]);
    await started.promise;
    releaseLearningLines(subtitle.lines, subtitle.frequency);
    subtitle.lines = [];
    reply.resolve([token("stale")]);
    await refresh.whenIdle();
    assert.equal(subtitle.frequency.size, 0);
    refresh.dispose();
  });
});
