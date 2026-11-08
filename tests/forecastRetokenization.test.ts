import assert from 'node:assert/strict';
import {test} from 'node:test';
import {BoxTipsService, parseBoxTipsResponse, type BoxTipsContent} from '../main/helpers/boxTips';
import {resolveForecastDictionaryContent, type ForecastDictionaryDependencies, type ForecastJapaneseWord} from '../main/helpers/forecastRetokenization';
import Japanese from '../main/handler/japanese';
import {setStoreFactory} from '../main/handler/common/storeHandlers';
import {analyzeText} from '../main/handler/languages/analyzer';
import {dispatchInvoke, ipcMain} from '../renderer/platform/backend/shims/electron';

const cue = {from: 1000, to: 3000, text: '試験を受けた。'};
const options = {lang: 'ja', includeDictionary: true};
const part = (surface: string, reading: string, meaning: string, extra = {}) => ({surface, reading, meaning, ...extra});
const segments = [part('試験', 'しけん', 'exam'), part('を', 'を', 'object marker'),
  part('受けた', 'うけた', 'took', {basicForm: '受ける'}), part('。', '', '')];
const parse = (parts = segments, target = cue) => parseBoxTipsResponse(JSON.stringify({tips: [], retokenizations: [{...target, segments: parts}]}),
  {...options, cues: [target]});
const dependencies = (words: Record<string, ForecastJapaneseWord> = {}): ForecastDictionaryDependencies => ({
  lookup: async (surface) => words[surface] ?? null,
  derive: async (surface) => surface === '受けた' ? {basicForm: '受ける', reading: 'うけた', pos: '動詞'} : null
});
const found = (basicForm: string, reading: string): ForecastJapaneseWord => ({basicForm, reading, source: 'default'});

test('AI word boundaries and contextual glosses are parsed independently of dictionary additions', () => {
  const parsed = parse();
  assert.equal(parsed.retokenizations?.length, 1);
  assert.deepEqual(parsed.retokenizations[0].tokens.map((token) => [token.origin, token.contextMeaning]),
    [['試験', 'exam'], ['を', 'object marker'], ['受けた', 'took'], ['。', '']]);
  assert.equal(parsed.retokenizations[0].tokens.map((token) => token.origin).join(''), cue.text);
  assert.deepEqual(parsed.dictionaryEntries, []);
});

test('segmentation rejects omissions, invented speech, missing word meanings and oversized glosses', () => {
  assert.equal(parse(segments.slice(0, -1)).retokenizations, undefined, 'punctuation must be preserved too');
  assert.equal(parse([part('試験を受けていない。', 'しけんをうけていない', 'did not take an exam')]).retokenizations, undefined);
  assert.equal(parse([part(cue.text, '', '')]).retokenizations, undefined);
  assert.equal(parse([part(cue.text, '', 'one two three four five six seven eight nine')]).retokenizations, undefined);
  assert.equal(parseBoxTipsResponse(JSON.stringify({retokenizations: [{...cue, segments}]}), {...options, includeDictionary: false, cues: [cue]}).retokenizations, undefined);
});

test('generated word meanings and reusable definitions must be English even for Japanese dialogue', () => {
  const target = {from: 0, to: 1000, text: '星詠み'};
  assert.equal(parse([part('星詠み', 'ほしよみ', '占星的人', {dictionaryMeaning: 'star reader'})], target).retokenizations, undefined);
  assert.equal(parse([part('星詠み', 'ほしよみ', 'star reader', {dictionaryMeaning: '占星的人'})], target).retokenizations, undefined);
  assert.equal(parse([part('星詠み', 'ほしよみ', '星を読む人', {dictionaryMeaning: 'star reader'})], target).retokenizations, undefined);
  assert.equal(parse([part('星詠み', 'ほしよみ', 'star reader', {dictionaryMeaning: 'person who reads the stars'})], target).retokenizations.length, 1);
});

test('existing words can be regrouped by AI without adding dictionary entries', async () => {
  const target = {from: 0, to: 2000, text: 'に際して'};
  const parsed = parse([part('に際して', 'にさいして', 'on the occasion of', {dictionaryMeaning: 'on the occasion of'})], target);
  const result = await resolveForecastDictionaryContent(parsed, options, dependencies({'に際して': found('に際して', 'にさいして')}));
  assert.deepEqual(result.dictionaryEntries, []);
  assert.equal(result.retokenizations[0].tokens.length, 1);
  assert.equal(result.retokenizations[0].tokens[0].origin, 'に際して');
  assert.equal(result.retokenizations[0].tokens[0].contextMeaning, 'on the occasion of');
  assert.equal(result.retokenizations[0].tokens[0].basicForm, 'に際して');
});

test('a conjugated known word resolves its existing dictionary form and keeps the surface reading', async () => {
  const result = await resolveForecastDictionaryContent(parse(), options, dependencies({
    試験: found('試験', 'しけん'), を: found('を', 'を'), 受ける: found('受ける', 'うける')
  }));
  const token = result.retokenizations[0].tokens[2];
  assert.deepEqual(result.dictionaryEntries, []);
  assert.equal(token.origin, '受けた');
  assert.equal(token.basicForm, '受ける', 'MeaningBox receives the existing dictionary form');
  assert.equal(token.hiragana, 'うけた');
  assert.equal(token.contextMeaning, 'took');
  assert.ok(token.separation.length > 0);
});

test('only a confirmed missing word gets a reusable fallback, separate from its contextual meaning', async () => {
  const target = {from: 0, to: 3000, text: '星詠み'};
  const parsed = parse([part('星詠み', 'ほしよみ', 'the star reader', {dictionaryMeaning: 'divination by the stars'})], target);
  const result = await resolveForecastDictionaryContent(parsed, options, dependencies({星: found('星', 'ほし')}));
  assert.deepEqual(result.dictionaryEntries, [{surface: '星詠み', reading: 'ほしよみ', meaning: 'divination by the stars', language: 'ja'}]);
  assert.equal(result.retokenizations[0].tokens[0].contextMeaning, 'the star reader');
  assert.equal(result.retokenizations[0].tokens[0].basicForm, '星詠み');
});

test('a confirmed missing word without a reusable definition cannot publish an unresolvable token', async () => {
  const target = {from: 0, to: 3000, text: '星詠み'};
  const parsed = parse([part('星詠み', 'ほしよみ', 'star reader')], target);
  const result = await resolveForecastDictionaryContent(parsed, options, dependencies());
  assert.deepEqual(result.dictionaryEntries, []);
  assert.deepEqual(result.retokenizations, []);
});

test('a confirmed missing word without a reliable reading cannot publish an unresolvable token', async () => {
  const target = {from: 0, to: 3000, text: '星詠み'};
  const parsed = parse([part('星詠み', '', 'star reader', {dictionaryMeaning: 'divination by the stars'})], target);
  const result = await resolveForecastDictionaryContent(parsed, options, dependencies());
  assert.deepEqual(result.dictionaryEntries, []);
  assert.deepEqual(result.retokenizations, []);
});

test('a known word needs no AI fallback definition and reuses its verified reading', async () => {
  const target = {from: 0, to: 3000, text: '試験'};
  const parsed = parse([part('試験', '', 'the exam')], target);
  const result = await resolveForecastDictionaryContent(parsed, options, dependencies({試験: found('試験', 'しけん')}));
  assert.deepEqual(result.dictionaryEntries, []);
  assert.equal(result.retokenizations[0].tokens[0].hiragana, 'しけん');
  assert.equal(result.retokenizations[0].tokens[0].contextMeaning, 'the exam');
});

test('saved manual meanings remain global while AI supplies a separate cue-local gloss', async () => {
  const target = {from: 0, to: 3000, text: '星詠み'};
  const parsed = parse([part('星詠み', 'wrong', 'the star reader', {dictionaryMeaning: 'replace my entry'})], target);
  const result = await resolveForecastDictionaryContent(parsed, options, dependencies({
    星詠み: {basicForm: '星詠み', reading: 'ほしよみ', source: 'user', userSource: 'manual', meaning: 'my saved definition'}
  }));
  assert.deepEqual(result.dictionaryEntries, []);
  assert.equal(result.retokenizations[0].tokens[0].userDictionaryMeaning, 'my saved definition');
  assert.equal(result.retokenizations[0].tokens[0].userDictionarySource, 'manual');
  assert.equal(result.retokenizations[0].tokens[0].contextMeaning, 'the star reader');
  assert.equal(result.retokenizations[0].tokens[0].hiragana, 'ほしよみ');
});

test('an unavailable dictionary is never interpreted as a missing entry', async () => {
  const result = await resolveForecastDictionaryContent(parse(), options, {
    lookup: async () => { throw new Error('still opening'); }, derive: async () => null
  });
  assert.deepEqual(result.dictionaryEntries, []);
  assert.deepEqual(result.retokenizations, []);
});

test('standalone legacy suggestions are checked against the actual dictionary before saving', async () => {
  const entry = {surface: '試験', reading: 'しけん', meaning: 'test', language: 'ja'};
  const result = await resolveForecastDictionaryContent({tips: [], dictionaryEntries: [entry]}, options, dependencies({試験: found('試験', 'しけん')}));
  assert.deepEqual(result.dictionaryEntries, []);
});

test('service returns isolated enriched cue tokens without sharing mutable token or ruby arrays', async () => {
  let calls = 0;
  const service = new BoxTipsService(async () => {
    calls++;
    return {content: JSON.stringify({tips: [], retokenizations: [{...cue, segments}]})};
  }, Date.now, (content, request) => resolveForecastDictionaryContent(content, request, dependencies({
    試験: found('試験', 'しけん'), を: found('を', 'を'), 受ける: found('受ける', 'うける')
  })));
  const request = {...options, cues: [cue], apiKey: 'test', model: 'test'};
  const first = await service.generate(request);
  first.retokenizations[0].tokens[0].contextMeaning = 'mutated';
  first.retokenizations[0].tokens[0].separation[0].main = 'mutated';
  const second = await service.generate(request);
  assert.equal(calls, 1);
  assert.equal(second.retokenizations[0].tokens[0].contextMeaning, 'exam');
  assert.notEqual(second.retokenizations[0].tokens[0].separation[0].main, 'mutated');
});

test('cached model analysis rechecks manual edits and deletions without another paid request', async () => {
  const target = {from: 0, to: 1000, text: '星詠み'};
  let calls = 0;
  let current: ForecastJapaneseWord | null = {basicForm: '星詠み', reading: 'ほしよみ', source: 'user', userSource: 'manual', meaning: 'first saved definition'};
  const dependency: ForecastDictionaryDependencies = {lookup: async () => current, derive: async () => null};
  const service = new BoxTipsService(async () => {
    calls++;
    return {content: JSON.stringify({tips: [], retokenizations: [{...target,
      segments: [part('星詠み', 'ほしよみ', 'star reader', {dictionaryMeaning: 'divination by the stars'})]}]})};
  }, Date.now, (content, request) => resolveForecastDictionaryContent(content, request, dependency));
  const request = {...options, cues: [target], apiKey: 'test', model: 'test'};
  const first = await service.generate(request);
  assert.equal(first.retokenizations[0].tokens[0].userDictionaryMeaning, 'first saved definition');
  current = {...current, reading: 'ほしうらない', meaning: 'corrected definition'};
  const edited = await service.generate(request);
  assert.equal(edited.retokenizations[0].tokens[0].userDictionaryMeaning, 'corrected definition');
  assert.equal(edited.retokenizations[0].tokens[0].hiragana, 'ほしうらない');
  current = null;
  const deleted = await service.generate(request);
  assert.equal(deleted.retokenizations[0].tokens[0].userDictionaryMeaning, undefined);
  assert.equal(deleted.retokenizations[0].tokens[0].userDictionarySource, undefined);
  assert.equal(deleted.retokenizations[0].tokens[0].hiragana, 'ほしよみ');
  assert.equal(deleted.dictionaryEntries[0].meaning, 'divination by the stars');
  assert.equal(calls, 1);
});

test('cancelling while a cached analysis resolves its dictionary cannot return a stale cue', async () => {
  const target = {from: 0, to: 1000, text: '試験'};
  let delayed: Promise<ForecastJapaneseWord | null> | null = null;
  let release: (word: ForecastJapaneseWord | null) => void;
  let calls = 0;
  const service = new BoxTipsService(async () => {
    calls++;
    return {content: JSON.stringify({tips: [], retokenizations: [{...target, segments: [part('試験', 'しけん', 'the exam')]}]})};
  }, Date.now, (content, request) => resolveForecastDictionaryContent(content, request, {
    lookup: async () => delayed ? await delayed : found('試験', 'しけん'), derive: async () => null
  }));
  const request = {...options, cues: [target], apiKey: 'test', model: 'test'};
  await service.generate(request);
  delayed = new Promise((resolve) => { release = resolve; });
  const abort = new AbortController();
  const pending = service.generate({...request, signal: abort.signal});
  abort.abort();
  release(found('試験', 'しけん'));
  await assert.rejects(pending, /cancel/i);
  assert.equal(calls, 1);
});

test('production lookup checks exact JMdict entries rather than treating prefix matches as existing words', async () => {
  const oldDict = Japanese.Dict;
  const oldTokenizer = Japanese.kuromojiTokenizer;
  const word = {id: '1', kanji: [{text: '試験', common: true, tags: []}], kana: [{text: 'しけん', common: true, tags: [], appliesToKanji: ['*']}],
    sense: [{partOfSpeech: ['n'], gloss: [{text: 'examination', lang: 'eng', type: null}]}]};
  const data = new Map([['indexes/kanji/試験-1', '1'], ['indexes/kana/しけん-1', '1'], ['raw/words/1', JSON.stringify(word)]]);
  const db = {
    get: async (key) => data.get(key), getMany: async (keys) => keys.map((key) => data.get(key)), close: async () => {},
    values: ({gte = '', lt = '\uffff'}) => ({all: async () => [...data].filter(([key]) => key >= gte && key < lt).map(([, value]) => value)})
  };
  setStoreFactory(async () => ({get: (_key, fallback) => fallback, set() {}}));
  Japanese.Dict = {db, tags: {}};
  Japanese.kuromojiTokenizer = {tokenizeForSentence: () => []} as never;
  try {
    const known: BoxTipsContent = {tips: [], dictionaryEntries: [{surface: '試験', reading: 'しけん', meaning: 'test', language: 'ja'}]};
    assert.deepEqual((await resolveForecastDictionaryContent(known, options)).dictionaryEntries, []);
    const missing: BoxTipsContent = {tips: [], dictionaryEntries: [{surface: '試験用語', reading: 'しけんようご', meaning: 'exam terminology', language: 'ja'}]};
    assert.equal((await resolveForecastDictionaryContent(missing, options)).dictionaryEntries[0].surface, '試験用語');
  } finally { Japanese.Dict = oldDict; Japanese.kuromojiTokenizer = oldTokenizer; }
});

test('legacy AI duplicates fall back to JMdict in word lookup, glosses and normal tokenization; manual entries still win', async () => {
  const oldDict = Japanese.Dict;
  const oldTokenizer = Japanese.kuromojiTokenizer;
  const word = {id: 'existing', kanji: [{text: '試験', common: true, tags: []}], kana: [{text: 'しけん', common: true, tags: [], appliesToKanji: ['*']}],
    sense: [{partOfSpeech: ['n'], gloss: [{text: 'examination', lang: 'eng', type: null}]}]};
  const data = new Map([['indexes/kanji/試験-existing', 'existing'], ['indexes/kana/しけん-existing', 'existing'], ['raw/words/existing', JSON.stringify(word)]]);
  let scans = 0;
  const db = {
    get: async (key) => data.get(key), getMany: async (keys) => keys.map((key) => data.get(key)), close: async () => {},
    values: ({gte = '', lt = '\uffff'}) => ({all: async () => { scans++; return [...data].filter(([key]) => key >= gte && key < lt).map(([, value]) => value); }})
  };
  const saved = {surface: '試験', reading: 'しけん', meaning: 'old AI duplicate', language: 'ja', source: 'ai', updatedAt: 1};
  const values = new Map<string, any>([['userDictionary.enabled', true], ['userDictionary.data', {revision: 1, entries: [saved]}]]);
  setStoreFactory(async () => ({get: (key, fallback) => values.has(key) ? values.get(key) : fallback, set: (key, value) => { values.set(key, value); }}));
  Japanese.Dict = {db, tags: {}};
  Japanese.kuromojiTokenizer = {tokenizeForSentence: (surface) => [{surface_form: surface, basic_form: surface, reading: 'シケン',
    pos: '名詞', pos_detail_1: '*', pos_detail_2: '*', pos_detail_3: '*'}]} as never;
  Japanese.registerHandlers();
  try {
    const queried = await dispatchInvoke('queryJapanese', ['試験', 8]) as any[];
    assert.equal(queried[0].id, 'existing');
    assert.match(queried.at(-1).id, /^user:/, 'the saved duplicate is retained without taking priority');
    assert.deepEqual(await dispatchInvoke('learningGlossesJapanese', [[{target: '試験', reading: 'しけん'}]]), ['examination']);
    const before = scans;
    const tokens = await analyzeText('試験', {tokenizerMode: 'kuromoji'});
    assert.equal(tokens[0].userDictionaryMeaning, undefined);
    assert.equal(scans, before, 'matched AI terms reuse the bounded exact-entry lookup cache');
    const parsed = parse([part('試験', 'wrong', 'the final exam', {dictionaryMeaning: 'replace it'})], {from: 0, to: 1000, text: '試験'});
    const resolved = await resolveForecastDictionaryContent(parsed, options);
    assert.deepEqual(resolved.dictionaryEntries, []);
    assert.equal(resolved.retokenizations[0].tokens[0].hiragana, 'しけん');
    assert.equal(resolved.retokenizations[0].tokens[0].contextMeaning, 'the final exam');

    values.set('userDictionary.data', {revision: 2, entries: [{...saved, source: 'manual', meaning: 'my correction'}]});
    assert.match((await dispatchInvoke('queryJapanese', ['試験', 8]) as any[])[0].id, /^user:/);
    assert.deepEqual(await dispatchInvoke('learningGlossesJapanese', [[{target: '試験', reading: 'しけん'}]]), ['my correction']);
    assert.equal((await analyzeText('試験', {tokenizerMode: 'kuromoji'}))[0].userDictionaryMeaning, 'my correction');
  } finally {
    Japanese.Dict = oldDict;
    Japanese.kuromojiTokenizer = oldTokenizer;
    for (const channel of ['queryJapanese', 'learningGlossesJapanese', 'queryKanji', 'japaneseTags', 'getInflectionTable', 'getWaniKanji', 'getWaniRadical', 'readKanjiSVG']) ipcMain.removeHandler(channel);
  }
});
