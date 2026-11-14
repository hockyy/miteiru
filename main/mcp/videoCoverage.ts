/** How much of a video's speech is made of words the learner saved (the rate_video tool). */
import {toKatakana} from "wanakana";

/**
 * Whether a reading tells more than the word itself: テレビ read てれび doesn't. Compared in katakana,
 * which keeps ー (in hiragana wanakana spells ラーメン らあめん, and the tokenizer's reading is らーめん).
 */
export const readingDiffers = (word: string, reading: string): boolean => (
  toKatakana(word, {passRomaji: true}) !== toKatakana(reading, {passRomaji: true})
);

export interface VideoCoverage {
  words: {spoken: number; different: number; differentNotSaved: number};
  /** Percent of the spoken words saved as Known (level 2) or Learning (level 1); the rest is notSaved. */
  coverage: {known: number; learning: number; notSaved: number};
  verdict: "comfortable" | "challenging" | "hard";
  wordsPerMinute: number;
  topNotSaved: Array<{word: string; reading?: string; count: number}>;
  learningWordsHeard: Array<{word: string; count: number}>;
}

type SavedWords = Record<string, {level: number}>;

const TOP_NOT_SAVED = 15;
const TOP_LEARNING = 10;
// Words that carry no meaning of their own: Japanese particles, auxiliaries, prefixes (お, ご),
// interjections and fillers.
const FUNCTION_WORD_POS = new Set(["助詞", "助動詞", "接頭詞", "記号", "フィラー", "感動詞", "その他"]);
const HAS_LETTER = /\p{L}/u;

/**
 * The word a token is saved under: its dictionary form when it has a real one (Kuromoji's "*" means
 * none), else its text. The subtitle's right-click save does the same (Subtitle/Sentence.tsx).
 */
export const wordKey = (token: any): string => {
  const base = token?.basicForm;
  return typeof base === "string" && base !== "" && base !== "*" ? base : String(token?.origin ?? "");
};

/**
 * Whether a token counts as a word a learner saves: it has a letter, and in Japanese it isn't a function
 * word, a grammatical noun (の, こと, よう: 名詞-非自立) or a name suffix (さん, ちゃん: 名詞-接尾-人名).
 */
export const isCountedWord = (token: any): boolean => {
  if (!HAS_LETTER.test(wordKey(token))) return false;
  if (typeof token?.pos !== "string") return true;
  const [pos, detail, more] = token.pos.split("-");
  if (FUNCTION_WORD_POS.has(pos)) return false;
  return !(pos === "名詞" && (detail === "非自立" || (detail === "接尾" && more === "人名")));
};

const round1 = (value: number) => Math.round(value * 10) / 10;

const levelOf = (saved: SavedWords, key: string) => (
  Object.prototype.hasOwnProperty.call(saved, key) ? saved[key]?.level : undefined
);

// What to show beside a word that is not saved yet: the kana of the bare dictionary form (見る gets みる
// from a bare 見る, not from 見た), else the pinyin or jyutping.
const readingOf = (token: any, key: string): string | undefined => {
  const candidates = [
    token?.origin === key ? token?.hiragana : undefined,
    token?.pinyin,
    token?.jyutping
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const reading = candidate.trim();
    if (reading && readingDiffers(key, reading)) return reading;
  }
  return undefined;
};

interface WordStats {
  count: number;
  level: number | undefined;
  reading?: string;
}

/** The most frequent first; a tie goes to the word heard first (Map order, and sort is stable). */
const mostFrequent = (words: Map<string, WordStats>, keep: (stats: WordStats) => boolean, limit: number) => (
  [...words.entries()].filter(([, stats]) => keep(stats)).sort((a, b) => b[1].count - a[1].count).slice(0, limit)
);

export const computeCoverage = (lines: any[][], saved: SavedWords, minutes: number): VideoCoverage => {
  const words = new Map<string, WordStats>();
  let spoken = 0;
  let known = 0;
  let learning = 0;
  let withLetters = 0;

  for (const line of lines) {
    for (const token of line) {
      const key = wordKey(token);
      if (!HAS_LETTER.test(key)) continue;
      withLetters++;
      if (!isCountedWord(token)) continue;
      spoken++;
      let stats = words.get(key);
      if (!stats) {
        stats = {count: 0, level: levelOf(saved, key)};
        words.set(key, stats);
      }
      stats.count++;
      if (stats.level === 2) known++;
      else if (stats.level === 1) learning++;
      if (!stats.reading && stats.level !== 1 && stats.level !== 2) stats.reading = readingOf(token, key);
    }
  }

  const knownPercent = spoken ? round1(known / spoken * 100) : 0;
  const learningPercent = spoken ? round1(learning / spoken * 100) : 0;
  const savedPercent = round1(knownPercent + learningPercent);
  const isNotSaved = (stats: WordStats) => stats.level !== 1 && stats.level !== 2;

  return {
    words: {
      spoken,
      different: words.size,
      differentNotSaved: [...words.values()].filter(isNotSaved).length
    },
    coverage: {
      known: knownPercent,
      learning: learningPercent,
      notSaved: spoken ? round1(100 - savedPercent) : 0
    },
    verdict: savedPercent >= 95 ? "comfortable" : savedPercent >= 85 ? "challenging" : "hard",
    wordsPerMinute: minutes > 0 ? Math.round(withLetters / minutes) : 0,
    topNotSaved: mostFrequent(words, isNotSaved, TOP_NOT_SAVED).map(([word, stats]) => ({
      word,
      ...(stats.reading ? {reading: stats.reading} : {}),
      count: stats.count
    })),
    learningWordsHeard: mostFrequent(words, (stats) => stats.level === 1, TOP_LEARNING)
      .map(([word, stats]) => ({word, count: stats.count}))
  };
};
