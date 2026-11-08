import assert from "node:assert/strict";
import {test} from "node:test";
import {
  BoxTipsService,
  boxTipsMessages,
  normalizeBoxTipsCues,
  parseBoxTipsResponse,
  type GenerateBoxTipsOptions
} from "../main/helpers/boxTips";
import {JobCancelledError} from "../main/helpers/runCommand";

const cues = [
  {from: 1000, to: 3000, text: "猫の手も借りたい。星詠みの時間だ。"},
  {from: 4000, to: 6000, text: "そういうわけじゃない。"}
];
const options: GenerateBoxTipsOptions = {apiKey: "test-key", model: "test/model", lang: "ja", cues};
const useful = {tips: [{from: 1000, to: 3000, kind: "idiom", title: "猫の手も借りたい", text: "An idiom for being extremely busy, rather than literally needing a cat's paw."}]};
const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return {promise, resolve};
};

test("Box tips accept only known note kinds attached to supplied cue times and cap the output", () => {
  const manyCues = Array.from({length: 6}, (_, index) => ({from: index * 1000, to: index * 1000 + 800, text: "example"}));
  const tips = manyCues.map(({from, to}) => ({from, to, kind: "grammar", title: "<b>Construction</b>", text: "A useful <em>grammar</em> point."}));
  const parsed = parseBoxTipsResponse(JSON.stringify({tips: [
    {from: 99999, to: 100000, kind: "grammar", title: "Outside", text: "not a supplied cue"},
    {...tips[0], kind: "translation"},
    ...tips
  ]}), {...options, cues: manyCues});
  assert.equal(parsed.tips.length, 3);
  assert.equal(parsed.tips[0].title, "Construction");
  assert.equal(parsed.tips[0].text, "A useful grammar point.");
  assert.deepEqual(parsed.tips.map(({from}) => from), [0, 1000, 2000]);
});

test("verbose explanations are skipped intact and each cue gets one short note", () => {
  const parsed = parseBoxTipsResponse(JSON.stringify({tips: [
    {...useful.tips[0], title: "Too wordy", text: "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen"},
    {...useful.tips[0], title: "Too long", text: "x".repeat(121)},
    {...useful.tips[0], title: "x".repeat(41)},
    useful.tips[0],
    {...useful.tips[0], title: "Another point", text: "Another explanation of the same cue."},
    {from: 4000, to: 6000, kind: "grammar", title: "わけじゃない", text: "Softens a denial: it is not necessarily so."}
  ]}), options);
  assert.deepEqual(parsed.tips.map(({title, text}) => ({title, text})), [
    {title: useful.tips[0].title, text: useful.tips[0].text},
    {title: "わけじゃない", text: "Softens a denial: it is not necessarily so."}
  ]);
});

test("short note bounds count graphemes without breaking combined characters", () => {
  const title = "か\u3099".repeat(40);
  const text = "e\u0301".repeat(120);
  const parsed = parseBoxTipsResponse(JSON.stringify({tips: [{...useful.tips[0], title, text}]}), options);
  assert.equal(parsed.tips[0].title, title);
  assert.equal(parsed.tips[0].text, text);
});

test('Box tip explanations are English only while source phrase headings may be Japanese', () => {
  const parsed = parseBoxTipsResponse(JSON.stringify({tips: [
    {...useful.tips[0], text: '这句话表示非常忙。'},
    {...useful.tips[0], text: 'とても忙しいという意味です。'},
    {...useful.tips[0], text: 'This 猫 phrase means very busy.'},
    {...useful.tips[0], title: '猫の手も借りたい', text: 'So busy that any help would do.'}
  ]}), options);
  assert.equal(parsed.tips.length, 1);
  assert.equal(parsed.tips[0].title, '猫の手も借りたい');
  assert.equal(parsed.tips[0].text, 'So busy that any help would do.');
  assert.deepEqual(parseBoxTipsResponse(JSON.stringify({tips: [], dictionaryEntries: [
    {surface: '星詠み', reading: 'ほしよみ', meaning: '占星的人'}
  ]}), {...options, includeDictionary: true}).dictionaryEntries, []);
});

test("skipping a verbose note preserves dictionary additions from the same batch", () => {
  const entry = {surface: "星詠み", reading: "ほしよみ", meaning: "divination by the stars", language: "ja"};
  const parsed = parseBoxTipsResponse(JSON.stringify({
    tips: [{...useful.tips[0], text: "A verbose explanation ".repeat(20)}],
    dictionaryEntries: [entry]
  }), {...options, includeDictionary: true});
  assert.deepEqual(parsed.tips, []);
  assert.deepEqual(parsed.dictionaryEntries, [entry]);
});

test("dictionary suggestions are independently enabled, use the requested language and require a subtitle surface", () => {
  const content = JSON.stringify({
    ...useful,
    dictionaryEntries: [
      {surface: "星詠み", reading: "ほしよみ", meaning: "star reading; divination by the stars", language: "wrong-language"},
      {surface: "星詠み", reading: "duplicate", meaning: "duplicate"},
      {surface: "absent word", reading: "absent", meaning: "not in the subtitles"},
      {surface: "時間", reading: "", meaning: "time"}
    ]
  });
  assert.equal(parseBoxTipsResponse(content, options).dictionaryEntries, undefined);
  const parsed = parseBoxTipsResponse(content, {...options, includeTips: false, includeDictionary: true});
  assert.deepEqual(parsed.tips, []);
  assert.deepEqual(parsed.dictionaryEntries, [{surface: "星詠み", reading: "ほしよみ", meaning: "star reading; divination by the stars", language: "ja"}]);
});

test("strict JSON rejects prose or code fences and handles an unremarkable window silently", () => {
  assert.throws(() => parseBoxTipsResponse("```json\n{}\n```", options), /invalid Box tips JSON/);
  assert.throws(() => parseBoxTipsResponse("[]", options), /invalid Box tips response/);
  assert.deepEqual(parseBoxTipsResponse('{"tips":[]}', options), {tips: []});
});

test("the prompt requests compact useful notes and conservative reusable dictionary additions", () => {
  const messages = boxTipsMessages({...options, includeTips: false, includeDictionary: true});
  assert.match(messages[0].content, /Tips are disabled/);
  assert.match(messages[0].content, /Dictionary suggestions are enabled/);
  assert.match(messages[0].content, /not.*standalone literal translations/i);
  assert.match(messages[0].content, /uncertain guess/);
  assert.match(messages[0].content, /at most 18 English words and 120 characters/);
  assert.match(messages[0].content, /only with its own current subtitle, including while paused/);
  assert.match(messages[0].content, /No countdowns/);
  assert.deepEqual(JSON.parse(messages[1].content).cues, cues);
});

test("forecast windows are bounded before any model request", () => {
  assert.throws(() => normalizeBoxTipsCues(Array.from({length: 81}, () => cues[0])), /at most 80/);
  assert.throws(() => normalizeBoxTipsCues([{from: 1, to: 0, text: "invalid"}]), /invalid subtitle cue/);
  assert.throws(() => normalizeBoxTipsCues([{from: 0, to: 100000, text: "too long"}]), /at most 90 seconds/);
  assert.throws(() => normalizeBoxTipsCues([{from: 0, to: 100000, text: "long overlap"}, {from: 1000, to: 2000, text: "short overlap"}]), /at most 90 seconds/);
  assert.deepEqual(normalizeBoxTipsCues([{from: 0, to: 1000, text: "<i>hello</i>"}]), [{from: 0, to: 1000, text: "hello"}]);
});

test("identical batches share one paid request and later use a copied cached result", async () => {
  let calls = 0;
  let observed: Parameters<ConstructorParameters<typeof BoxTipsService>[0]>[0] | undefined;
  const reply = deferred<{content: string}>();
  const service = new BoxTipsService(async (request) => { calls++; observed = request; return reply.promise; });
  const first = service.generate({...options, thinking: "model"});
  const second = service.generate({...options, thinking: "model"});
  await nextTurn();
  assert.equal(calls, 1);
  assert.equal(observed?.model, "test/model");
  assert.equal(observed?.thinking, "model");
  assert.equal(observed?.timeoutMs, 45000);
  reply.resolve({content: JSON.stringify(useful)});
  const [one, two] = await Promise.all([first, second]);
  one.tips[0].text = "mutated by a caller";
  assert.equal(two.tips[0].text, useful.tips[0].text);
  const cached = await service.generate({...options, thinking: "model"});
  assert.equal(calls, 1);
  assert.equal(cached.tips[0].text, useful.tips[0].text);
});

test("cache keys include language, model, thinking and both independent feature flags", async () => {
  let calls = 0;
  const service = new BoxTipsService(async () => { calls++; return {content: '{"tips":[],"dictionaryEntries":[]}'}; });
  await service.generate(options);
  await service.generate({...options, includeDictionary: true});
  await service.generate({...options, includeDictionary: true, includeTips: false});
  await service.generate({...options, model: "other/model"});
  await service.generate({...options, thinking: "model"});
  await service.generate({...options, lang: "yue"});
  assert.equal(calls, 6);
});

test("one cancelled subscriber does not abort another caller sharing the same batch", async () => {
  const reply = deferred<{content: string}>();
  let sharedSignal: AbortSignal | undefined;
  const service = new BoxTipsService(async ({signal}) => { sharedSignal = signal; return reply.promise; });
  const firstController = new AbortController();
  const first = service.generate({...options, signal: firstController.signal});
  const second = service.generate(options);
  await nextTurn();
  firstController.abort();
  await assert.rejects(first, JobCancelledError);
  assert.equal(sharedSignal?.aborted, false);
  reply.resolve({content: '{"tips":[]}'});
  assert.deepEqual(await second, {tips: []});
});

test("cancelling the last subscriber aborts the request and a late result cannot poison the cache", async () => {
  const reply = deferred<{content: string}>();
  let calls = 0;
  let sharedSignal: AbortSignal | undefined;
  const service = new BoxTipsService(async ({signal}) => {
    calls++;
    if (calls === 1) { sharedSignal = signal; return reply.promise; }
    return {content: '{"tips":[]}'};
  });
  const controller = new AbortController();
  const old = service.generate({...options, signal: controller.signal});
  await nextTurn();
  controller.abort();
  await assert.rejects(old, JobCancelledError);
  assert.equal(sharedSignal?.aborted, true);
  assert.deepEqual(await service.generate(options), {tips: []});
  reply.resolve({content: JSON.stringify(useful)});
  await nextTurn();
  assert.deepEqual(await service.generate(options), {tips: []});
  assert.equal(calls, 2);
});

test("empty and disabled batches make no request, failures are retriable, and recent cache entries expire", async () => {
  let calls = 0;
  let now = 1000;
  const service = new BoxTipsService(async () => {
    if (++calls === 1) throw new Error("model failed");
    return {content: '{"tips":[]}'};
  }, () => now);
  assert.deepEqual(await service.generate({...options, cues: []}), {tips: []});
  assert.deepEqual(await service.generate({...options, includeTips: false}), {tips: []});
  assert.equal(calls, 0);
  await assert.rejects(service.generate(options), /model failed/);
  await service.generate(options);
  await service.generate(options);
  assert.equal(calls, 2);
  now += 20 * 60_000;
  await service.generate(options);
  assert.equal(calls, 3);
});

const isBoxTipsValidationError = (error: unknown) => error instanceof Error
  && !(error instanceof TypeError) && /Box tips/i.test(error.message);

test('malformed AI root values and nonstring content produce clear validation failures', () => {
  for (const content of [undefined, null, false, 42, {}, [], ['{"tips":[]}']]) {
    assert.throws(() => parseBoxTipsResponse(content as never, options), isBoxTipsValidationError);
  }
  for (const content of ['null', 'false', '42', '"text"', '[]', '[{"tips":[]}]']) {
    assert.throws(() => parseBoxTipsResponse(content, options), isBoxTipsValidationError);
  }
});

test('present forecast collection fields must be arrays while omitted optional fields are valid', () => {
  const enabled = {...options, includeDictionary: true};
  for (const field of ['tips', 'dictionaryEntries', 'retokenizations']) {
    for (const value of [null, false, 12, 'items', {}]) {
      assert.throws(() => parseBoxTipsResponse(JSON.stringify({[field]: value}), enabled), isBoxTipsValidationError,
        `${field} must reject ${JSON.stringify(value)}`);
    }
  }
  assert.deepEqual(parseBoxTipsResponse('{}', options), {tips: []});
  assert.deepEqual(parseBoxTipsResponse('{}', enabled), {tips: [], dictionaryEntries: []});
});

test('bad nested model items are filtered without discarding valid tips, meanings or segments', () => {
  const cue = {from: 1000, to: 3000, text: '星詠み。'};
  const tip = {...useful.tips[0], title: '星詠み', text: 'An unusual word for divination by the stars.'};
  const word = {surface: '星詠み', reading: 'ほしよみ', meaning: 'divination by the stars'};
  const segments = [{surface: '星詠み', reading: 'ほしよみ', meaning: 'star divination', dictionaryMeaning: word.meaning},
    {surface: '。', reading: '', meaning: ''}];
  const parsed = parseBoxTipsResponse(JSON.stringify({
    tips: [null, false, 17, [], {...tip, title: {}}, {...tip, text: []}, tip],
    dictionaryEntries: [null, 'bad', [], {...word, meaning: {}}, {...word, surface: false}, word],
    retokenizations: [null, 'bad', [], {...cue, segments: {}}, {...cue, segments: [null]},
      {...cue, segments: [{...segments[0], meaning: {}}, segments[1]]}, {...cue, segments}]
  }), {...options, cues: [cue], includeDictionary: true});
  assert.deepEqual(parsed.tips, [tip]);
  assert.deepEqual(parsed.dictionaryEntries, [{...word, language: 'ja'}]);
  assert.equal(parsed.retokenizations?.length, 1);
  assert.deepEqual(parsed.retokenizations?.[0].tokens.map(({origin, contextMeaning}) => ({origin, contextMeaning})), [
    {origin: '星詠み', contextMeaning: 'star divination'}, {origin: '。', contextMeaning: ''}
  ]);
});

test('a malformed model response is not cached and the same forecast request can retry', async () => {
  let calls = 0;
  const service = new BoxTipsService(async () => ({content: ++calls === 1 ? '{"tips":null}' : JSON.stringify(useful)}));
  await assert.rejects(service.generate(options), isBoxTipsValidationError);
  assert.deepEqual(await service.generate(options), useful);
  assert.deepEqual(await service.generate(options), useful);
  assert.equal(calls, 2);
});

test('corrupt cached forecast structures fail safely, are evicted, and allow a fresh retry', async () => {
  const token = {origin: '星詠み', hiragana: 'ほしよみ', basicForm: '星詠み', contextMeaning: 'star divination',
    dictionaryMeaning: 'divination by the stars', separation: [{origin: '星詠', hiragana: 'ほしよ'}]};
  const retokenization = {...cues[0], tokens: [token]};
  const corruptions = [null, [], {tips: null}, {tips: {}}, {tips: [null]}, {tips: [{...useful.tips[0], text: {}}]},
    {tips: [], dictionaryEntries: {}}, {tips: [], dictionaryEntries: [null]},
    {tips: [], retokenizations: {}}, {tips: [], retokenizations: [null]},
    {tips: [], retokenizations: [{...retokenization, tokens: null}]},
    {tips: [], retokenizations: [{...retokenization, tokens: {}}]},
    {tips: [], retokenizations: [{...retokenization, tokens: [null]}]},
    {tips: [], retokenizations: [{...retokenization, tokens: [{...token, separation: {}}]}]},
    {tips: [], retokenizations: [{...retokenization, tokens: [{...token, separation: [null]}]}]}];
  for (const corruption of corruptions) {
    let calls = 0;
    const service = new BoxTipsService(async () => { calls++; return {content: JSON.stringify(useful)}; });
    await service.generate(options);
    const cache = (service as any).cache as Map<string, {at: number; content: unknown}>;
    const key = cache.keys().next().value!;
    cache.set(key, {at: Date.now(), content: corruption});
    await assert.rejects(service.generate(options), isBoxTipsValidationError, JSON.stringify(corruption));
    assert.equal(cache.size, 0);
    assert.deepEqual(await service.generate(options), useful);
    assert.equal(calls, 2);
  }
});

test('invalid resolved content fails safely and recovery reuses valid paid analysis', async () => {
  let calls = 0;
  let corrupt = true;
  const service = new BoxTipsService(async () => { calls++; return {content: JSON.stringify(useful)}; }, Date.now,
    async (content) => corrupt ? {tips: null} as never : content);
  await assert.rejects(service.generate(options), isBoxTipsValidationError);
  corrupt = false;
  assert.deepEqual(await service.generate(options), useful);
  assert.equal(calls, 1);
});

test('invalid cache envelopes and sparse arrays fail validation without poisoning retry', async () => {
  for (const corruption of [null, false, 42, {at: null, content: useful}, {at: NaN, content: useful},
    {at: Date.now(), content: {tips: Array(1)}}]) {
    let calls = 0;
    const service = new BoxTipsService(async () => { calls++; return {content: JSON.stringify(useful)}; });
    await service.generate(options);
    const cache = (service as any).cache as Map<string, unknown>;
    cache.set(cache.keys().next().value!, corruption);
    await assert.rejects(service.generate(options), isBoxTipsValidationError);
    assert.equal(cache.size, 0);
    assert.deepEqual(await service.generate(options), useful);
    assert.equal(calls, 2);
  }
});
