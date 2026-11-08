/**
 * Times the Study page's AI tools with your own OpenRouter key, through the app's own request code
 * (renderer/utils/openRouterClient.ts). It sends a sentence analysis and a translation, each with
 * thinking off (the app's default) and with thinking left to the model (video settings → AI →
 * "Let the model think before answering"). It prints the median time to the first text, which is
 * when the answer starts to show, and to the whole answer.
 *
 *   PowerShell:  $env:OPENROUTER_API_KEY = "sk-or-..."; npm run measure:ai
 *   bash:        OPENROUTER_API_KEY=sk-or-... npm run measure:ai
 *
 * Options, after `--`:
 *   --model <id>        default: the app's default model
 *   --lang ja|zh-CN|yue default: ja
 *   --runs <n>          runs of each of the four kinds of request, default 3
 * Every request is billed to the key: 12 by default. With the default model that is normally well
 * under a cent.
 */
import {parseArgs} from 'node:util';
import {buildAnalysisSystemPrompt, buildAnalysisUserPrompt} from '../renderer/utils/aiAnalysisPrompts';
import {
  buildTranslationSystemPrompt,
  buildTranslationUserPrompt,
  defaultTranslationDetailOptions,
  getTranslationTargetLang,
} from '../renderer/utils/aiTranslationPrompts';
import {
  DEFAULT_OPENROUTER_MODEL,
  OPENROUTER_THINKING_KEY,
  type OpenRouterThinking,
} from '../renderer/utils/openRouterConstants';
import {streamOpenRouterCompletion} from '../renderer/utils/openRouterClient';

// One sentence in the language being learned, for the analysis.
const ANALYSIS_SENTENCES: Record<string, string> = {
  ja: '昨日は友達と一緒に新しいラーメン屋に行きました。',
  'zh-CN': '我昨天跟朋友一起去了一家新开的面馆。',
  yue: '我琴日同朋友去咗間新開嘅拉麵舖。',
};
// The translator turns the learner's own sentences into the language being learned.
const TRANSLATION_SOURCE = ['Do you want to see a movie next Saturday?', "I'll wait for you in front of the station."];

const {values} = parseArgs({
  options: {
    model: {type: 'string', default: DEFAULT_OPENROUTER_MODEL},
    lang: {type: 'string', default: 'ja'},
    runs: {type: 'string', default: '3'},
  },
});
const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};
const apiKey = process.env.OPENROUTER_API_KEY?.trim()
  || fail('Set OPENROUTER_API_KEY to your OpenRouter key first; the top of scripts/measureAiSpeed.ts shows how.');
const model = values.model;
const lang = values.lang;
const targetLang = getTranslationTargetLang(lang) ?? fail(`--lang must be ja, zh-CN or yue, not "${lang}".`);
const runs = Number(values.runs);
if (!Number.isInteger(runs) || runs < 1) fail(`--runs must be a whole number of at least 1, not "${values.runs}".`);

// The client reads the thinking setting from the app's store (window.electronStore). This stands in.
let thinking: OpenRouterThinking = 'off';
(globalThis as unknown as {window: unknown}).window = {
  electronStore: {
    get: async (key: string, fallback: unknown) => (key === OPENROUTER_THINKING_KEY ? thinking : fallback),
  },
};

// What each request asked for. A model that refuses to answer without thinking gets asked again by
// the client, which then lets that model think for the rest of the run; the summary says so.
type Sent = {reasoning: unknown; status?: number};
let sent: Sent[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const entry: Sent = {reasoning: undefined};
  if (url.startsWith('https://openrouter.ai/')) {
    if (typeof init?.body === 'string') {
      try {
        entry.reasoning = JSON.parse(init.body).reasoning;
      } catch {
        // Not a JSON body; nothing to record.
      }
    }
    sent.push(entry);
  }
  const response = await realFetch(input, init);
  entry.status = response.status;
  return response;
}) as typeof fetch;

type Message = {role: 'system' | 'user'; content: string};
const tasks: {name: string; messages: Message[]}[] = [
  {
    name: 'Sentence analysis',
    messages: [
      {role: 'system', content: buildAnalysisSystemPrompt(lang)},
      {role: 'user', content: buildAnalysisUserPrompt(ANALYSIS_SENTENCES[lang], lang)},
    ],
  },
  {
    name: 'Translation, 2 lines',
    messages: [
      {role: 'system', content: buildTranslationSystemPrompt(targetLang, defaultTranslationDetailOptions)},
      {role: 'user', content: buildTranslationUserPrompt(TRANSLATION_SOURCE)},
    ],
  },
];
const modes: OpenRouterThinking[] = ['off', 'model'];

type Result = {firstTextMs: number | null; totalMs: number; chars: number; requests: Sent[]};

async function measure(messages: Message[], mode: OpenRouterThinking): Promise<Result> {
  thinking = mode;
  sent = [];
  const start = performance.now();
  let firstTextMs: number | null = null;
  const text = await streamOpenRouterCompletion(apiKey, model, messages, {
    onText: (latest) => {
      if (latest && firstTextMs === null) firstTextMs = performance.now() - start;
    },
  });
  return {firstTextMs, totalMs: performance.now() - start, chars: text.length, requests: sent};
}

const median = (numbers: number[]) => {
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const seconds = (ms: number | null) => (ms === null ? '-' : `${(ms / 1000).toFixed(2)} s`);

async function main() {
  console.log(`${model}, ${lang}: ${runs} run(s) of each, ${runs * tasks.length * modes.length} requests.`);
  const results = new Map<string, Result[]>();
  for (let round = 0; round < runs; round++) {
    // Alternate which setting goes first, so neither always gets the warmer connection.
    const order = round % 2 === 0 ? modes : [...modes].reverse();
    for (const task of tasks) {
      for (const mode of order) {
        try {
          const result = await measure(task.messages, mode);
          const key = `${task.name}\n${mode}`;
          results.set(key, [...(results.get(key) ?? []), result]);
          process.stdout.write('.');
        } catch (error) {
          // The app's message for a refused key points at its settings; here the key came from the environment.
          const keyHint = sent.at(-1)?.status === 401 ? '\nThe key tried is the one in OPENROUTER_API_KEY.' : '';
          fail(`\n${task.name}, thinking ${mode}: ${error instanceof Error ? error.message : String(error)}${keyHint}`);
        }
      }
    }
  }
  console.log('\n');

  const rows = [['', 'Thinking off: first text', 'whole answer', 'Model thinks: first text', 'whole answer']];
  for (const task of tasks) {
    const row = [task.name];
    for (const mode of modes) {
      const list = results.get(`${task.name}\n${mode}`) ?? [];
      const firsts = list.map((r) => r.firstTextMs).filter((ms): ms is number => ms !== null);
      row.push(seconds(firsts.length ? median(firsts) : null), seconds(median(list.map((r) => r.totalMs))));
    }
    rows.push(row);
  }
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
  for (const row of rows) console.log(row.map((cell, column) => cell.padEnd(widths[column])).join('   '));

  const offRuns = tasks.flatMap((task) => results.get(`${task.name}\noff`) ?? []);
  if (offRuns.some((r) => r.requests.length > 1 || r.requests.some((request) => request.reasoning === undefined))) {
    console.log(`\n${model} won't answer without thinking. The app then lets it think and remembers that for`
      + ' the model, so its "off" times above are thinking times too.');
  }
  const empty = [...results.values()].flat().filter((r) => r.chars === 0).length;
  if (empty) console.log(`\n${empty} answer(s) came back empty.`);
}

main();
