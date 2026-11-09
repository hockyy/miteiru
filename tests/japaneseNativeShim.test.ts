import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {setStoreFactory} from '../main/handler/common/storeHandlers';
import {setSys} from '../renderer/platform/backend/sys';
import {builder, JAPANESE_APP_WORDS_KEY} from '../renderer/platform/backend/shims/kuromoji';
import {decodeJapaneseTokenBatch} from '../renderer/platform/backend/shims/japaneseTokenBatch';
import type {JapaneseBackendTokenizer} from '../main/helpers/japaneseTokenizerWords';
import type {UserDictionaryEntry} from '../main/helpers/userDictionary';

const build = () => new Promise<JapaneseBackendTokenizer>((resolve, reject) => builder({dicPath: '/pack/japanese/dict', jmdictPath: '/pack/japanese/dict/jmdict.pack'})
  .build((error, tokenizer) => error ? reject(error) : resolve(tokenizer as JapaneseBackendTokenizer)));

const binaryBatch = (texts: string[]) => new TextEncoder().encode(JSON.stringify({
  features: [['名詞', '一般', '*', '*', '*', '*']],
  tokens: texts.map((text) => [[1, 'KNOWN', 1, text, 0, text, null, null]]),
})).buffer;

test('Japanese defaults to native, loads once, and updates only the extra lexicon on revisions', async () => {
  const calls: {cmd: string; args: Record<string, unknown>}[] = [];
  setStoreFactory(async () => ({get: (_key, fallback) => fallback, set: () => undefined}));
  setSys(async (cmd, args) => { calls.push({cmd, args}); return cmd === 'japanese_tokenize' ? [{surface_form: args.text}] : undefined; });
  const tokenizer = await build();
  const entries: UserDictionaryEntry[] = [{surface: '星詠み', reading: 'ほしよみ', meaning: 'star reader', language: 'ja', source: 'manual', updatedAt: 1}];
  await tokenizer.setUserWords(entries);
  await tokenizer.tokenizeForSentence('あの星詠みを見ている');
  await tokenizer.setUserWords(entries);
  await tokenizer.tokenizeForSentence('お星詠み様');
  await tokenizer.setUserWords([]);
  await tokenizer.tokenizeForSentence('あの星詠みを見ている');
  assert.deepEqual(calls.map((call) => call.cmd), ['japanese_load', 'japanese_set_words', 'japanese_tokenize', 'japanese_tokenize', 'japanese_set_words', 'japanese_tokenize']);
  assert.deepEqual(calls[1].args.words, [{surface: '星詠み', source: 'manual'}]);
  assert.equal(calls[0].args.appWords, false);
  assert.deepEqual(calls[4].args.words, []);
  assert.equal(calls[2].args.text, 'あの星詠みを見ている');
});

test('a failed native load is surfaced, never silently replaced by kuromoji', async () => {
  setStoreFactory(async () => ({get: (_key, fallback) => fallback, set: () => undefined}));
  setSys(async () => { throw new Error('broken IPADIC'); });
  await assert.rejects(build(), /broken IPADIC/);
});

test('concurrent Japanese lines keep their own extra-word revision', async () => {
  setStoreFactory(async () => ({get: (_key, fallback) => fallback, set: () => undefined}));
  let active = '';
  const seen: string[] = [];
  setSys(async (cmd, args) => {
    if (cmd === 'japanese_set_words') active = JSON.stringify(args.words);
    if (cmd === 'japanese_tokenize') { await new Promise((resolve) => setTimeout(resolve, 1)); seen.push(`${args.text}:${active}`); return []; }
  });
  const tokenizer = await build();
  const entry: UserDictionaryEntry = {surface: '星詠み', reading: 'ほしよみ', meaning: 'star reader', language: 'ja', source: 'manual', updatedAt: 1};
  await Promise.all([tokenizer.tokenizeWithUserWords('before', [entry]), tokenizer.tokenizeWithUserWords('after', [])]);
  assert.deepEqual(seen, ['before:[{"surface":"星詠み","source":"manual"}]', 'after:[]']);
});

test('concurrent subtitles use one binary native batch, not one IPC call per line', async () => {
  setStoreFactory(async () => ({get: (_key, fallback) => fallback, set: () => undefined}));
  const calls: string[] = [];
  setSys(async (cmd, args) => {
    calls.push(cmd);
    if (cmd === 'japanese_tokenize_batch') {
      return binaryBatch(args.texts as string[]);
    }
  });
  const tokenizer = await build();
  const tokens = await Promise.all(['甲', '乙', '丙'].map((text) => tokenizer.tokenizeWithUserWords(text, [])));
  assert.deepEqual(tokens.map((line) => line[0].surface_form), ['甲', '乙', '丙']);
  assert.deepEqual(calls, ['japanese_load', 'japanese_set_words', 'japanese_tokenize_batch']);
});

test('large subtitle files keep every line while respecting the native batch limit', async () => {
  setStoreFactory(async () => ({get: (_key, fallback) => fallback, set: () => undefined}));
  const batches: number[] = [];
  let active = 0;
  let maxActive = 0;
  setSys(async (cmd, args) => {
    if (cmd === 'japanese_tokenize_batch') {
      const texts = args.texts as string[];
      batches.push(texts.length);
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      return binaryBatch(texts);
    }
    if (cmd === 'japanese_tokenize') { batches.push(1); return [{surface_form: args.text}]; }
  });
  const tokenizer = await build();
  const texts = Array.from({length: 1025}, (_, index) => `line-${index}`);
  const tokens = await Promise.all(texts.map((text) => tokenizer.tokenizeWithUserWords(text, [])));
  assert.deepEqual(tokens.map((line) => line[0].surface_form), texts);
  assert.deepEqual(batches, [...Array(8).fill(128), 1]);
  assert.equal(maxActive, 4);
});

test('parallel batches finish before a different dictionary revision is applied', async () => {
  setStoreFactory(async () => ({get: (_key, fallback) => fallback, set: () => undefined}));
  let revision = '';
  let inFlight = 0;
  const revisions: string[] = [];
  setSys(async (cmd, args) => {
    if (cmd === 'japanese_set_words') {
      assert.equal(inFlight, 0, 'a revision cannot change during a native batch');
      revision = JSON.stringify(args.words);
      revisions.push(revision);
    }
    if (cmd === 'japanese_tokenize_batch') {
      const ownRevision = revision;
      inFlight++;
      await new Promise((resolve) => setTimeout(resolve, 2));
      assert.equal(revision, ownRevision);
      inFlight--;
      return (args.texts as string[]).map((text) => [{surface_form: text}]);
    }
  });
  const tokenizer = await build();
  const entry: UserDictionaryEntry = {surface: '星詠み', reading: 'ほしよみ', meaning: 'star reader', language: 'ja', source: 'manual', updatedAt: 1};
  const before = Array.from({length: 256}, (_, index) => `before-${index}`);
  const after = Array.from({length: 256}, (_, index) => `after-${index}`);
  const tokens = await Promise.all([...before.map((text) => tokenizer.tokenizeWithUserWords(text, [])),
    ...after.map((text) => tokenizer.tokenizeWithUserWords(text, [entry]))]);
  assert.deepEqual(tokens.map((line) => line[0].surface_form), [...before, ...after]);
  assert.deepEqual(revisions, ['[]', '[{"surface":"星詠み","source":"manual"}]']);
});

test('the Rust batch fixture preserves every token field and rejects a missing feature row', () => {
  const fixture = JSON.parse(readFileSync(path.join(__dirname, 'fixtures/japanese-token-batch.json'), 'utf8'));
  assert.deepEqual(decodeJapaneseTokenBatch(new TextEncoder().encode(JSON.stringify(fixture.wire)).buffer), fixture.raw);
  assert.throws(() => decodeJapaneseTokenBatch(new TextEncoder().encode(JSON.stringify({...fixture.wire, features: []})).buffer), /Invalid Japanese token features/);
});

test('JMdict headword nodes load only through the explicit opt-in store key', async () => {
  const calls: {cmd: string; args: Record<string, unknown>}[] = [];
  setStoreFactory(async () => ({get: (key, fallback) => key === JAPANESE_APP_WORDS_KEY ? true : fallback, set: () => undefined}));
  setSys(async (cmd, args) => { calls.push({cmd, args}); });
  await build();
  assert.equal(calls[0].cmd, 'japanese_load');
  assert.equal(calls[0].args.appWords, true);
});
