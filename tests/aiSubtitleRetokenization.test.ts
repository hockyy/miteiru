import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Line, SubtitleContainer} from '../renderer/components/Subtitle/DataStructures';
import {
  applyAiSubtitleRetokenizations, clearAiSubtitleRetokenizations, fillSubtitleWithLearningContent,
  SubtitleRetokenizer, type AiSubtitleRetokenization
} from '../renderer/components/Subtitle/subtitleLanguageSupport';
import {PlaybackClock} from '../renderer/utils/playbackClock';
import {HookHost, loadHooks} from './helpers/reactHookHost';

const token = (origin: string, contextMeaning?: string, extra: Record<string, unknown> = {}) => ({
  origin, basicForm: origin, hiragana: '', pos: '名詞', separation: [{main: origin}],
  ...(contextMeaning === undefined ? {} : {contextMeaning}), ...extra
});
const subtitleOf = (text = '学生です') => {
  const subtitle = new SubtitleContainer();
  subtitle.language = 'ja';
  subtitle.lines = [new Line(1000, 4000, text)];
  return subtitle;
};
const analysis = (extra: Partial<AiSubtitleRetokenization> = {}): AiSubtitleRetokenization => ({
  from: 1000, to: 4000, text: '学生です', tokens: [token('学生', 'student here'), token('です', 'polite ending')], ...extra
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return {promise, resolve};
};
const withGlosses = async (run: (calls: {target: string}[][]) => Promise<void>) => {
  const globals = globalThis as Record<string, unknown>;
  const saved = globals.window;
  const calls: {target: string}[][] = [];
  globals.window = {backend: {invoke: async (_channel: string, batch: {target: string}[]) => {
    calls.push(batch);
    return batch.map(({target}) => `dictionary:${target}`);
  }}};
  try { await run(calls); } finally {
    if (saved === undefined) delete globals.window;
    else globals.window = saved;
  }
};

test('AI boundaries and contextual glosses apply together without another dictionary lookup', async () => {
  await withGlosses(async (calls) => {
    const subtitle = subtitleOf();
    await fillSubtitleWithLearningContent(subtitle, async () => [token('old')]);
    calls.length = 0;
    let announcements = 0;
    subtitle.onChange(() => { announcements++; });
    assert.equal(applyAiSubtitleRetokenizations(subtitle, [analysis()]), 1);
    assert.deepEqual((subtitle.lines[0].content as any[]).map(({origin}) => origin), ['学生', 'です']);
    assert.deepEqual(subtitle.lines[0].meaning, ['student here', 'polite ending']);
    assert.deepEqual([...subtitle.frequency], [['学生', 1], ['です', 1]]);
    assert.equal(calls.length, 0);
    assert.equal(announcements, 1);
    assert.equal(applyAiSubtitleRetokenizations(subtitle, [analysis()]), 0);
    assert.equal(announcements, 1, 'analysis notifications cannot cause an application loop');
  });
});

test('clipped cue ranges apply only to the same live text and timestamp', () => {
  const subtitle = subtitleOf();
  assert.equal(applyAiSubtitleRetokenizations(subtitle, [analysis({from: 2000, to: 3000})]), 1);
  assert.equal(applyAiSubtitleRetokenizations(subtitle, [analysis({from: 5000, to: 6000})]), 0);
  assert.equal(applyAiSubtitleRetokenizations(subtitle, [analysis({text: '古い字幕', tokens: [token('古い字幕', 'old cue')]})]), 0);
  assert.equal(applyAiSubtitleRetokenizations(subtitle, [analysis({tokens: [token('学生', 'missing half')]})]), 0);
});

test('AI analysis invalidates an older default tokenizer response that completes later', async () => {
  await withGlosses(async () => {
    const subtitle = subtitleOf();
    const reply = deferred<any[]>();
    const started = deferred<void>();
    const initial = fillSubtitleWithLearningContent(subtitle, async () => { started.resolve(); return reply.promise; });
    await started.promise;
    applyAiSubtitleRetokenizations(subtitle, [analysis()]);
    reply.resolve([token('stale')]);
    await initial;
    assert.deepEqual((subtitle.lines[0].content as any[]).map(({origin}) => origin), ['学生', 'です']);
    assert.deepEqual(subtitle.lines[0].meaning, ['student here', 'polite ending']);
    assert.equal(subtitle.frequency.has('stale'), false);
  });
});

test('a dictionary refresh preserves AI boundaries and gives manual corrections priority', async () => {
  await withGlosses(async (calls) => {
    const subtitle = subtitleOf();
    applyAiSubtitleRetokenizations(subtitle, [analysis()]);
    const refresh = new SubtitleRetokenizer({
      subtitle, getPlaybackTimeMs: () => 1500,
      tokenizeMiteiru: async () => [token('学生', undefined, {
        hiragana: 'がくせい', userDictionaryId: 'ja:学生', userDictionarySource: 'manual', userDictionaryMeaning: 'my definition'
      }), token('で'), token('す')]
    });
    refresh.refresh(['学生']);
    await refresh.whenIdle();
    const contents = subtitle.lines[0].content as any[];
    assert.deepEqual(contents.map(({origin}) => origin), ['学生', 'です']);
    assert.equal(contents[0].hiragana, 'がくせい');
    assert.deepEqual(subtitle.lines[0].meaning, ['my definition', 'polite ending']);
    assert.equal(calls.length, 0, 'contextual word glosses avoid new built-in lookups');
    assert.deepEqual([...subtitle.frequency], [['学生', 1], ['です', 1]]);
    refresh.dispose();
  });
});

test('contextual glosses take priority over AI dictionary generic definitions', () => {
  const subtitle = subtitleOf();
  const tokens = [token('学生', 'student in this class', {
    userDictionaryId: 'ja:学生', userDictionarySource: 'ai', userDictionaryMeaning: 'pupil; student'
  }), token('です', '')];
  applyAiSubtitleRetokenizations(subtitle, [analysis({tokens})]);
  assert.deepEqual(subtitle.lines[0].meaning, ['student in this class', '']);
});

test('an AI result arriving during dictionary work is refreshed against the new boundaries', async () => {
  await withGlosses(async () => {
    const subtitle = subtitleOf();
    const reply = deferred<any[]>();
    const started = deferred<void>();
    let calls = 0;
    const refresh = new SubtitleRetokenizer({
      subtitle, getPlaybackTimeMs: () => 1500,
      tokenizeMiteiru: async () => {
        if (++calls === 1) { started.resolve(); return reply.promise; }
        return [token('学生', undefined, {userDictionaryId: 'ja:学生', userDictionarySource: 'manual', userDictionaryMeaning: 'latest edit'}), token('で'), token('す')];
      }
    });
    refresh.refresh(['学生']);
    await started.promise;
    applyAiSubtitleRetokenizations(subtitle, [analysis()]);
    reply.resolve([token('stale')]);
    await refresh.whenIdle();
    assert.equal(calls, 2);
    assert.deepEqual((subtitle.lines[0].content as any[]).map(({origin}) => origin), ['学生', 'です']);
    assert.deepEqual(subtitle.lines[0].meaning, ['latest edit', 'polite ending']);
    assert.equal(subtitle.frequency.has('stale'), false);
    refresh.dispose();
  });
});

test('disabling AI restores ordinary tokens and removes contextual glosses without double counts', async () => {
  await withGlosses(async () => {
    const subtitle = subtitleOf();
    applyAiSubtitleRetokenizations(subtitle, [analysis()]);
    const refresh = new SubtitleRetokenizer({subtitle, getPlaybackTimeMs: () => 1500, tokenizeMiteiru: async () => [token('default')]});
    refresh.refreshLines(clearAiSubtitleRetokenizations(subtitle));
    await refresh.whenIdle();
    assert.deepEqual((subtitle.lines[0].content as any[]).map(({origin}) => origin), ['default']);
    assert.deepEqual(subtitle.lines[0].meaning, ['dictionary:default']);
    assert.deepEqual([...subtitle.frequency], [['default', 1]]);
    refresh.dispose();
  });
});

test('the live hook applies cached analyses to newly arriving cues and restores ordinary analysis when disabled', {timeout: 2000}, async () => {
  const globals = globalThis as Record<string, unknown>;
  const saved = globals.window;
  globals.window = {backend: {
    on: () => () => undefined,
    invoke: async (channel: string, batch: any[]) => channel === 'user-dictionary:list'
      ? {ok: true, entries: []} : batch.map(() => 'ordinary gloss')
  }};
  const host = new HookHost();
  const {useSubtitleRetokenization} = loadHooks<typeof import('../renderer/hooks/useSubtitleRetokenization')>(
    'renderer/hooks/useSubtitleRetokenization.ts', host
  );
  const restored = deferred<void>();
  const subtitle = subtitleOf();
  subtitle.lines = [];
  const options = {
    subtitle, enabled: true, clock: new PlaybackClock(), aiRetokenizations: [analysis()],
    tokenizeMiteiru: async () => [token('default')],
    setFrequencyPrimary: (frequency: Map<string, number>) => { if (frequency.has('default')) restored.resolve(); }
  };
  try {
    host.render(() => useSubtitleRetokenization(options));
    subtitle.lines = [new Line(1000, 4000, '学生です')];
    subtitle.notifyChanged();
    assert.deepEqual(subtitle.lines[0].meaning, ['student here', 'polite ending']);
    options.enabled = false;
    host.render(() => useSubtitleRetokenization(options));
    await restored.promise;
    assert.deepEqual((subtitle.lines[0].content as any[]).map(({origin}) => origin), ['default']);
    assert.deepEqual(subtitle.lines[0].meaning, ['ordinary gloss']);
    assert.deepEqual([...subtitle.frequency], [['default', 1]]);
  } finally {
    host.dispose();
    if (saved === undefined) delete globals.window;
    else globals.window = saved;
  }
});

test('two windows that split the same line differently settle on one split, so a change listener cannot loop', async () => {
  await withGlosses(async () => {
    const subtitle = subtitleOf();
    await fillSubtitleWithLearningContent(subtitle, async () => [token('old')]);
    // A line crossing a context window: one window saw 1000–3000 ms of it, the next 3000–4000 ms,
    // and the model split it differently each time (the owner's "Maximum call stack size exceeded").
    const early = analysis({to: 3000, tokens: [token('学生', 'student'), token('です', 'polite ending')]});
    const late = analysis({from: 3000, tokens: [token('学', 'study'), token('生です', 'life is')]});
    let applications = 0;
    // useSubtitleRetokenization re-applies the analyses on every subtitle change, like this.
    subtitle.onChange(() => {
      if (++applications > 20) throw new Error('the analyses keep replacing each other');
      applyAiSubtitleRetokenizations(subtitle, [early, late]);
    });
    assert.equal(applyAiSubtitleRetokenizations(subtitle, [early, late]), 1);
    assert.equal(applications, 1);
    // The window that saw more of the line wins, in either order.
    assert.deepEqual((subtitle.lines[0].content as any[]).map(({origin}) => origin), ['学生', 'です']);
    assert.equal(applyAiSubtitleRetokenizations(subtitle, [late, early]), 0);
  });
});
