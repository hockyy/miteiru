import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {isDeepStrictEqual} from 'node:util';
import ts from 'typescript';
import kuromoji from 'kuromoji';
import {scan} from '../main/helpers/dataTable';
import {parseJapaneseVerbs} from '../main/handler/languages/analyzer';
import {processKuromojinToSeparations, type KuromojinWord} from '../main/handler/languages/japaneseAnalysis';
import {type UserDictionaryEntry} from '../main/helpers/userDictionary';
import {japaneseUserDictionaryToken} from '../main/helpers/japaneseTokenizerWords';

type DictionaryWord = {surface: string; reading: string; conditions: number; noun: boolean};
type GoldLine = {id: string; text?: string; sentence?: string; surface?: string};
type NativeResult = {tokens: Record<string, KuromojinWord[][]>; metrics: Record<string, unknown>};
const root = process.cwd();
const argument = (name: string, fallback = '') => process.argv[process.argv.indexOf(name) + 1] ?? fallback;
const option = (name: string, fallback = '') => process.argv.includes(name) ? argument(name, fallback) : fallback;
const dict = path.resolve(option('--dict', 'node_modules/kuromoji/dict'));
const output = path.resolve(option('--out', 'dist/tokenizer-japanese'));
const jmdict = option('--jmdict');
const goldPath = option('--gold');
const repetitions = Number(option('--repetitions', '3'));

const hasJapanese = (text: string) => /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(text);

function repoCorpus(): string[] {
  const authored = fs.readFileSync(path.join(root, 'tests/fixtures/japanese-subtitles.txt'), 'utf8').trim().split(/\r?\n/);
  if (authored.length < 500 || new Set(authored).size !== authored.length) throw new Error('Expected at least 500 distinct authored subtitles');
  const corpus = new Set(authored);
  if (process.argv.includes('--authored-only')) return authored;
  const add = (text: string) => { if (hasJapanese(text) && text.length <= 2000) corpus.add(text); };
  const jsonStrings = (value: unknown) => {
    if (typeof value === 'string') add(value);
    else if (Array.isArray(value)) value.forEach(jsonStrings);
    else if (value && typeof value === 'object') Object.values(value).forEach(jsonStrings);
  };
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      if (entry.name === 'tokenizer-eval') continue;
      if (entry.name === 'tokenizerEval.test.ts') continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.(tsx?|jsx?)$/.test(file)) {
        const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest);
        const visit = (node: ts.Node) => {
          if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) add(node.text);
          ts.forEachChild(node, visit);
        };
        visit(source);
      } else if (file.endsWith('.json')) jsonStrings(JSON.parse(fs.readFileSync(file, 'utf8')));
    }
  };
  walk(path.join(root, 'tests'));
  return [...corpus];
}

const posBits = (tag: string) => tag === 'v1' || tag === 'v1-s' ? 1 : tag === 'v5k-s' ? 4
  : tag.startsWith('v5') ? 2 : ['vs', 'vs-i', 'vs-s', 'vs-c'].includes(tag) ? 8 : tag === 'vk' ? 16
    : ['adj-i', 'adj-ix'].includes(tag) ? 32 : tag === 'adj-na' ? 64 : tag === 'n' || tag.startsWith('n-') ? 128 : 0;

async function dictionaryWords(file: string): Promise<DictionaryWord[]> {
  if (!file) return [];
  const records = file.endsWith('.pack') ? (await scan(file, {prefix: 'raw/words/'})).map(([, value]) => JSON.parse(value.toString('utf8')))
    : JSON.parse(fs.readFileSync(file, 'utf8')).words;
  return records.flatMap((record) => {
    const tags: string[] = record.sense.flatMap((sense) => sense.partOfSpeech);
    const conditions = tags.reduce((bits, tag) => bits | posBits(tag), 0);
    const noun = tags.some((tag) => ['n', 'n-pr'].includes(tag)) && tags.every((tag) => ['n', 'n-pr', 'vs', 'adj-no', 'adj-na'].includes(tag));
    return [...record.kanji.map(({text: surface}) => ({surface,
      reading: record.kana.find((reading) => !reading.appliesToKanji || reading.appliesToKanji.some((value) => value === '*' || value === surface))?.text ?? '', conditions, noun})),
    ...record.kana.map(({text: surface}) => ({surface, reading: surface, conditions, noun: false}))];
  });
}

const collectHeap = () => {
  (globalThis as {gc?: () => void}).gc?.();
  const {heapUsed, arrayBuffers, rss} = process.memoryUsage();
  return {heapUsed, arrayBuffers, rss};
};

async function run() {
  fs.mkdirSync(output, {recursive: true});
  const gold: GoldLine[] | null = goldPath ? fs.readFileSync(goldPath, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line)) : null;
  const lines = gold ? gold.map((line) => {
    const text = line.text ?? line.sentence ?? line.surface;
    if (typeof text !== 'string') throw new Error(`Gold ${line.id} has no text field`);
    return text;
  }) : repoCorpus();
  const before = collectHeap();
  const start = performance.now();
  const legacy = await new Promise<kuromoji.Tokenizer>((resolve, reject) => kuromoji.builder({dicPath: dict})
    .build((error, tokenizer) => error ? reject(error) : resolve(tokenizer)));
  const loadMs = performance.now() - start;
  const loaded = collectHeap();
  const first = performance.now();
  legacy.tokenizeForSentence(lines[0] ?? '日本語');
  const firstTokenMs = performance.now() - first;
  const baselineErrors: {index: number; text: string; error: string}[] = [];
  const legacyTokens = (line: string, index: number) => {
    try { return legacy.tokenizeForSentence(line); }
    catch (error) { if (!baselineErrors.some((entry) => entry.index === index)) baselineErrors.push({index, text: line, error: String(error)}); return []; }
  };
  const baseline = lines.map(legacyTokens);
  const bench = performance.now();
  for (let repeat = 0; repeat < repetitions; repeat++) lines.forEach(legacyTokens);
  const batchMs = (performance.now() - bench) / repetitions;
  const words = await dictionaryWords(jmdict);
  const headwords = new Set(words.map((word) => word.surface));
  const savedWords: UserDictionaryEntry[] = [
    {surface: '新造固有語', reading: 'しんぞうこゆうご', meaning: 'a personal coined term', source: 'manual', language: 'ja', updatedAt: 1},
    {surface: '推し活', reading: 'おしかつ', meaning: 'fan activities', source: 'manual', language: 'ja', updatedAt: 1},
    {surface: '量子計算', reading: 'りょうしけいさん', meaning: 'quantum computing', source: 'ai', language: 'ja', updatedAt: 1},
  ];
  const userWords = savedWords.filter((entry) => entry.source === 'manual' || !headwords.has(entry.surface));
  const command = option('--binary', path.join(process.env.CARGO_TARGET_DIR ?? 'C:/Users/miki/miteiru/src-tauri/target', 'release/examples/japanese_tokenize' + (process.platform === 'win32' ? '.exe' : '')));
  const native = spawnSync(command, [dict], {encoding: 'utf8', input: JSON.stringify({lines, dictionary_words: words,
    user_words: userWords.map(({surface, source}) => ({surface, source})), repetitions}), maxBuffer: 512 * 1024 * 1024});
  if (native.status !== 0) throw new Error(native.stderr || native.error?.message || `Native exit ${native.status}`);
  const result: NativeResult = JSON.parse(native.stdout);
  const raw: Record<string, KuromojinWord[][]> = {kuromoji: baseline, ...result.tokens};
  const pipeline: Record<string, any[][]> = {};
  for (const [mode, tokenLines] of Object.entries(raw)) {
    pipeline[mode] = await Promise.all(tokenLines.map((tokens) => parseJapaneseVerbs(processKuromojinToSeparations(tokens).map((token) => {
      const entry = mode === 'user' ? userWords.find((entry) => entry.surface === token.origin) : undefined;
      return entry ? japaneseUserDictionaryToken(entry) : token;
    }), {learnerUnits: mode !== 'kuromoji'})));
    tokenLines.forEach((tokens, index) => {
      if (mode === 'kuromoji' && baselineErrors.some((error) => error.index === index)) return;
      if (tokens.map((token) => token.surface_form).join('') !== lines[index]
        || pipeline[mode][index].map((token) => token.origin).join('') !== lines[index]) {
        throw new Error(`${mode} does not reconstruct input line ${index + 1}`);
      }
    });
    fs.writeFileSync(path.join(output, `${mode}.predictions.jsonl`), pipeline[mode].map((tokens, index) => JSON.stringify({id: gold?.[index].id ?? `corpus-${index + 1}`, tokens: tokens.map((token) => token.origin)})).join('\n') + '\n');
  }
  const coverage = (tokenLines: any[][]) => {
    const all = tokenLines.flat();
    const tokens = all.filter((token) => hasJapanese(token.origin));
    const hits = tokens.filter((token) => headwords.has(token.basicForm) || headwords.has(token.origin)).length;
    const allHits = all.filter((token) => headwords.has(token.basicForm) || headwords.has(token.origin)).length;
    return {allTokens: all.length, allHits, allShare: all.length ? allHits / all.length : 0,
      japaneseTokens: tokens.length, japaneseHits: hits, japaneseShare: tokens.length ? hits / tokens.length : 0};
  };
  const fields: Record<string, number> = {};
  const differences: Record<string, unknown[]> = {};
  const comparison = {base: 'kuromoji', app: 'base', suffix: 'base', suffix_app: 'suffix', user: 'suffix'};
  for (const mode of Object.keys(result.tokens)) {
    differences[mode] = lines.flatMap((text, index) => {
      const previous = comparison[mode];
      const before = raw[previous][index];
      const after = raw[mode][index];
      const beforeLearner = pipeline[previous][index].map((token) => token.origin);
      const afterLearner = pipeline[mode][index].map((token) => token.origin);
      if (isDeepStrictEqual(before, after) && isDeepStrictEqual(beforeLearner, afterLearner)) return [];
      if (mode === 'base') for (let token = 0; token < Math.max(before.length, after.length); token++) {
        const keys = new Set([...Object.keys(before[token] ?? {}), ...Object.keys(after[token] ?? {})]);
        for (const key of keys) if (!isDeepStrictEqual(before[token]?.[key], after[token]?.[key])) fields[key] = (fields[key] ?? 0) + 1;
      }
      return [{id: gold?.[index].id ?? `corpus-${index + 1}`, text, before: before.map((token) => token.surface_form), after: after.map((token) => token.surface_form),
        beforeLearner, afterLearner}];
    });
  }
  const summary = {corpus: goldPath || (process.argv.includes('--authored-only') ? '505 individually authored subtitles'
    : '505 authored subtitles + Japanese-script test/fixture strings, including Han-only cross-language cases (gold excluded)'), lines: lines.length,
    baseline: {loadMs, firstTokenMs, loadToFirstMs: loadMs + firstTokenMs, batchMs, linesPerSecond: lines.length * 1000 / batchMs,
      heapDelta: loaded.heapUsed - before.heapUsed, arrayBufferDelta: loaded.arrayBuffers - before.arrayBuffers}, native: result.metrics,
    changed: Object.fromEntries(Object.entries(differences).map(([mode, changes]) => [mode, {lines: changes.length, share: changes.length / lines.length}])),
    learnerChanged: Object.fromEntries(Object.keys(result.tokens).map((mode) => {
      const changes = pipeline[mode].filter((tokens, index) => !isDeepStrictEqual(tokens.map((token) => token.origin), pipeline[comparison[mode]][index].map((token) => token.origin))).length;
      return [mode, {lines: changes, share: changes / lines.length}];
    })),
    finalVsKuromoji: {rawLines: raw.suffix.filter((tokens, index) => !isDeepStrictEqual(tokens, raw.kuromoji[index])).length,
      learnerLines: pipeline.suffix.filter((tokens, index) => !isDeepStrictEqual(tokens.map((token) => token.origin), pipeline.kuromoji[index].map((token) => token.origin))).length},
    reconstruction: 'All native raw and learner outputs reconstruct every input exactly',
    baselineErrors, baseFieldDifferences: fields, jmdictCoverage: Object.fromEntries(Object.entries(pipeline).map(([mode, tokens]) => [mode, coverage(tokens)]))};
  fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'differences.json'), JSON.stringify(differences, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'raw.json'), JSON.stringify({lines, raw}) + '\n');
  console.log(JSON.stringify(summary, null, 2));
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
