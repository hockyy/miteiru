import {toHiragana} from "./wanakana";

/** One ruby segment: `base` as written, `ruby` its reading in hiragana, "" when the base is read as written (kana). */
export interface RubySegment {
  base: string;
  ruby: string;
}

// Kana read as written. ー and the iteration marks ゝゞヽヾ count as kana; 々 and ヶ need a reading.
const READ_AS_WRITTEN = /^[ぁ-ゖゝゞァ-ヵーヽヾ]$/u;

const hira = (text: string) => toHiragana(text, {convertLongVowelMark: false});

/** Kana compared loosely: hiragana, and ー or a long vowel written out counts the same (こーひー, こうひい). */
const looseKana = (text: string) => hira(text).replace(/ー/g, "");

type Run = {text: string; kana: boolean};

const runsOf = (surface: string): Run[] => {
  const runs: Run[] = [];
  for (const char of surface) {
    const kana = READ_AS_WRITTEN.test(char);
    const last = runs.at(-1);
    if (last && last.kana === kana) last.text += char;
    else runs.push({text: char, kana});
  }
  return runs;
};

/**
 * Splits a word into ruby segments: each run of kanji (or other characters that need a reading, as 3
 * in 3月) with the part of `reading` it is read as, and each kana run with an empty ruby, so okurigana
 * stay bare: 送り仮名 read おくりがな is 送/おく, り, 仮名/がな. The kana runs anchor the split; when they
 * can't be found in the reading in order (an irregular reading, or a reading that doesn't fit), the
 * whole word is one segment with the whole reading. A word with no reading gets its runs unread.
 */
export const japaneseRuby = (surface: string, reading: string): RubySegment[] => {
  if (!surface) return [];
  const runs = runsOf(surface);
  if (runs.every((run) => run.kana)) return [{base: surface, ruby: ""}];
  const kana = hira(reading ?? "");
  if (!kana) return runs.map((run) => ({base: run.text, ruby: ""}));

  // Walk the runs: a kana run must appear next in the reading; a run before it takes what lies between.
  const result: RubySegment[] = [];
  const matched = match(runs, 0, kana, 0, result, {steps: 0});
  if (matched) return result;
  return [{base: surface, ruby: kana}];
};

/** Enough for any real word; a long run of repeated kana could otherwise make the search very long. */
const MAX_MATCH_STEPS = 5000;

/**
 * Backtracking match of runs[index..] against kana[at..]; fills `out`. A needs-reading run takes at
 * least one kana; it is tried shortest first, which is right when the next kana run's first kana also
 * ends the reading of this one (聞き手 read ききて: 聞/き, き, 手/て). Gives up (false) after
 * MAX_MATCH_STEPS tries, and the word is then one segment.
 */
const match = (runs: Run[], index: number, kana: string, at: number, out: RubySegment[], budget: {steps: number}): boolean => {
  if (++budget.steps > MAX_MATCH_STEPS) return false;
  if (index === runs.length) return at === kana.length;
  const run = runs[index];
  if (run.kana) {
    const written = looseKana(run.text);
    // Compare loosely, but consume as many reading characters as the run has (ー included).
    for (let length = Math.max(1, run.text.length - 2); length <= Math.min(kana.length - at, run.text.length + 2); length++) {
      if (looseKana(kana.slice(at, at + length)) !== written) continue;
      out.push({base: run.text, ruby: ""});
      if (match(runs, index + 1, kana, at + length, out, budget)) return true;
      out.pop();
      if (budget.steps > MAX_MATCH_STEPS) return false;
    }
    return false;
  }
  const isLast = index === runs.length - 1;
  for (let end = at + 1; end <= kana.length; end++) {
    if (isLast && end !== kana.length) continue;
    out.push({base: run.text, ruby: kana.slice(at, end)});
    if (match(runs, index + 1, kana, end, out, budget)) return true;
    out.pop();
    if (budget.steps > MAX_MATCH_STEPS) return false;
  }
  return false;
};

/** One segment per character for Chinese: each Han character with its syllable, others unread. */
export const chineseRuby = (characters: Array<{main: string; reading: string}>): RubySegment[] => (
  characters.map(({main, reading}) => ({base: main, ruby: /\p{Script=Han}/u.test(main) ? reading : ""}))
);
