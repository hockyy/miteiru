/**
 * Scores Japanese readings and word boundaries against the gold set in
 * tests/fixtures/japanese-readings/gold.jsonl (its README says how it was made).
 *
 *   npx tsx scripts/eval/japaneseReadings.ts <predictions.json> [--gold <gold.jsonl>] [--errors]
 *
 * predictions.json: {"<analyzer>": {"<line id>": [{"s": surface, "r": reading}]}}; readings in kana.
 *
 * Analyzers cut words differently (日本 + 酒 against 日本酒), so readings are compared over the spans
 * whose edges both segmentations share: a gold word read right is one whose span, joined from the
 * analyzer's pieces (kana pieces count as written), reads as the gold reading or one of its
 * alternatives. A merged span carries one verdict for every kanji word in it. Words whose reading the
 * gold leaves open (null: a truncated word, an unknowable name) are not scored. Boundaries are scored
 * as F1 against the gold's learner-click units; a split inside a numeral and its counter (三本) is
 * neither required nor wrong.
 */
import fs from "node:fs";
import path from "node:path";

export type GoldFlag = "name" | "counter";

export interface GoldToken {
  s: string;
  /** The reading in hiragana; undefined for a word without kanji, null when it is not scored. */
  reading?: string | null;
  alternatives: string[];
  flag?: GoldFlag;
}

export interface GoldLine {
  id: string;
  source: "hard-case";
  category?: string;
  text: string;
  tokens: GoldToken[];
}

export interface PredictedToken {
  s: string;
  /** The analyzer's reading for the piece, in kana ("" when it has none). */
  r?: string;
}

export const HAN = /[\p{Script=Han}々〆ヶ]/u;

export const parseGold = (jsonl: string): GoldLine[] => jsonl.split(/\r?\n/).filter((line) => line.trim()).map((line) => {
  const raw = JSON.parse(line);
  return {
    id: raw.id,
    source: raw.source,
    ...(raw.category ? {category: raw.category} : {}),
    text: raw.text,
    tokens: (raw.tokens as unknown[][]).map(([s, reading, alternatives, flag]) => ({
      s: s as string,
      ...(reading !== undefined ? {reading: reading as string | null} : {}),
      alternatives: Array.isArray(alternatives) ? alternatives as string[] : [],
      ...(flag ? {flag: flag as GoldFlag} : {})
    }))
  };
});

export const loadGold = (file = path.join(__dirname, "..", "..", "tests", "fixtures", "japanese-readings", "gold.jsonl")) => (
  parseGold(fs.readFileSync(file, "utf8"))
);

/** Kana as hiragana, without spaces: readings from any analyzer compare. */
export const hiragana = (text: string) => Array.from(text.replace(/\s+/g, ""))
  .map((char) => (char >= "ァ" && char <= "ヶ" ? String.fromCharCode(char.charCodeAt(0) - 0x60) : char))
  .join("");

interface Span<T> {
  start: number;
  end: number;
  token: T;
}

/**
 * The analyzer's pieces placed on the text (code points); text no piece covers (an analyzer that drops
 * spaces) becomes a piece of its own, read as written.
 */
const place = (text: string, tokens: PredictedToken[]): Span<PredictedToken>[] => {
  const chars = Array.from(text);
  const spans: Span<PredictedToken>[] = [];
  let cursor = 0;
  const gap = (until: number) => {
    if (until > cursor) spans.push({start: cursor, end: until, token: {s: chars.slice(cursor, until).join(""), r: ""}});
  };
  for (const token of tokens) {
    const surface = Array.from(token.s ?? "");
    if (surface.length === 0) continue;
    let at = -1;
    for (let candidate = cursor; candidate <= chars.length - surface.length && candidate - cursor <= 16; candidate++) {
      if (surface.every((char, index) => chars[candidate + index] === char)) {
        at = candidate;
        break;
      }
    }
    if (at < 0) continue;
    gap(at);
    spans.push({start: at, end: at + surface.length, token});
    cursor = at + surface.length;
  }
  gap(chars.length);
  return spans;
};

const goldSpans = (line: GoldLine): Span<GoldToken>[] => {
  let at = 0;
  return line.tokens.map((token) => {
    const length = Array.from(token.s).length;
    const span = {start: at, end: at + length, token};
    at += length;
    return span;
  });
};

/** A gold word that is scored: it has kanji and a reading. */
const scoredToken = (token: GoldToken) => HAN.test(token.s) && typeof token.reading === "string";

/** Every reading a span of gold words may have (their alternatives combined). */
const goldReadings = (tokens: GoldToken[]): Set<string> => {
  let options = [""];
  for (const token of tokens) {
    const choices = HAN.test(token.s) && typeof token.reading === "string" ? [token.reading, ...token.alternatives] : [token.s];
    options = options.flatMap((prefix) => choices.map((choice) => prefix + hiragana(choice)));
    if (options.length > 64) options = options.slice(0, 64);
  }
  return new Set(options);
};

export interface WordResult {
  line: string;
  word: string;
  flag?: GoldFlag;
  correct: boolean;
  expected: string;
  predicted: string;
}

export interface LineResult {
  words: WordResult[];
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
}

export const scoreLine = (line: GoldLine, predicted: PredictedToken[]): LineResult => {
  const gold = goldSpans(line);
  const pieces = place(line.text, predicted);
  const length = Array.from(line.text).length;
  const goldEdges = new Set([0, ...gold.map((span) => span.end)]);
  const predictedEdges = new Set([0, length, ...pieces.map((span) => span.start), ...pieces.map((span) => span.end)]);
  const shared = [...goldEdges].filter((edge) => predictedEdges.has(edge)).sort((a, b) => a - b);

  const words: WordResult[] = [];
  for (let index = 0; index + 1 < shared.length; index++) {
    const [from, to] = [shared[index], shared[index + 1]];
    const goldIn = gold.filter((span) => span.start >= from && span.end <= to).map((span) => span.token);
    const scored = goldIn.filter(scoredToken);
    if (scored.length === 0 || goldIn.some((token) => token.reading === null)) continue;
    const readings = goldReadings(goldIn);
    const reading = pieces.filter((span) => span.start >= from && span.end <= to)
      .map(({token}) => (HAN.test(token.s) ? hiragana(token.r ?? "") : hiragana(token.s)))
      .join("");
    const correct = readings.has(reading);
    for (const token of scored) {
      words.push({line: line.id, word: token.s, ...(token.flag ? {flag: token.flag} : {}), correct, expected: [...readings][0], predicted: reading});
    }
  }

  // Boundaries inside the line; a split inside a numeral and its counter is optional.
  const optional = new Set(gold.filter((span) => span.token.flag === "counter").flatMap((span) => {
    const inside: number[] = [];
    for (let edge = span.start + 1; edge < span.end; edge++) inside.push(edge);
    return inside;
  }));
  const inner = (edges: Set<number>) => [...edges].filter((edge) => edge > 0 && edge < length && !optional.has(edge));
  const goldInner = new Set(inner(goldEdges));
  const predictedInner = new Set(inner(predictedEdges));
  const truePositives = [...predictedInner].filter((edge) => goldInner.has(edge)).length;
  return {
    words,
    truePositives,
    falsePositives: predictedInner.size - truePositives,
    falseNegatives: goldInner.size - truePositives
  };
};

export interface Summary {
  /** Reading accuracy over the scored kanji words, names left out. */
  readings: {correct: number; total: number; accuracy: number};
  names: {correct: number; total: number; accuracy: number};
  counters: {correct: number; total: number; accuracy: number};
  /** Lines whose every scored word (names left out) reads right. */
  lines: {correct: number; total: number; accuracy: number};
  boundaries: {precision: number; recall: number; f1: number};
  errors: WordResult[];
}

const ratio = (correct: number, total: number) => ({correct, total, accuracy: total ? correct / total : 1});

export const scoreAll = (gold: GoldLine[], predictions: Record<string, PredictedToken[]>): Summary => {
  const all: WordResult[] = [];
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let linesCorrect = 0;
  let linesTotal = 0;
  for (const line of gold) {
    const result = scoreLine(line, predictions[line.id] ?? []);
    all.push(...result.words);
    tp += result.truePositives;
    fp += result.falsePositives;
    fn += result.falseNegatives;
    const counted = result.words.filter((word) => word.flag !== "name");
    if (counted.length > 0) {
      linesTotal++;
      if (counted.every((word) => word.correct)) linesCorrect++;
    }
  }
  const count = (words: WordResult[]) => ratio(words.filter((word) => word.correct).length, words.length);
  const words = all.filter((word) => word.flag !== "name");
  const precision = tp + fp ? tp / (tp + fp) : 1;
  const recall = tp + fn ? tp / (tp + fn) : 1;
  return {
    readings: count(words),
    names: count(all.filter((word) => word.flag === "name")),
    counters: count(all.filter((word) => word.flag === "counter")),
    lines: ratio(linesCorrect, linesTotal),
    boundaries: {precision, recall, f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0},
    errors: all.filter((word) => !word.correct)
  };
};

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

export const formatSummary = (name: string, summary: Summary) => [
  name.padEnd(24),
  `${percent(summary.readings.accuracy)} (${summary.readings.correct}/${summary.readings.total})`.padEnd(20),
  `${percent(summary.counters.accuracy)}`.padEnd(8),
  `${percent(summary.names.accuracy)}`.padEnd(8),
  `${percent(summary.lines.accuracy)}`.padEnd(8),
  percent(summary.boundaries.f1)
].join(" ");

export const SUMMARY_HEADER = ["analyzer".padEnd(24), "readings".padEnd(20), "counters".padEnd(8), "names".padEnd(8), "lines".padEnd(8), "boundary F1"].join(" ");

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const args = process.argv.slice(2);
  const goldFile = args.includes("--gold") ? args[args.indexOf("--gold") + 1] : undefined;
  const files = args.filter((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--gold");
  const gold = loadGold(goldFile);
  console.log(SUMMARY_HEADER);
  for (const file of files) {
    const byAnalyzer = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, Record<string, PredictedToken[]>>;
    for (const [name, predictions] of Object.entries(byAnalyzer)) {
      const summary = scoreAll(gold, predictions);
      console.log(formatSummary(name, summary));
      if (args.includes("--errors")) {
        for (const error of summary.errors) console.log(`    ${error.line} ${error.word}: ${error.predicted || "∅"} (gold ${error.expected})${error.flag ? ` [${error.flag}]` : ""}`);
      }
    }
  }
}
