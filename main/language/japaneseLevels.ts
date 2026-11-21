import {isKana, toHiragana} from "./wanakana";

/**
 * Japanese word levels for the language tools: a JLPT level (N5 easiest to N1) and a word frequency.
 * Built by scripts/data/buildJapaneseLevels.ts into renderer/public/study-data/japanese-levels/words.json;
 * the README there names the sources and their licences (CC BY-SA 4.0).
 *
 * The file (format 2):
 *   jlpt:      [[jmdictEntryId, level 1..5, kanji spelling or "", kana reading], ...]
 *              Jonathan Waller's JLPT lists with the JMdict entry id of each word (0 when it has none).
 *   frequency: [[centibels, [word, ...]], ...]
 *              wordfreq's Japanese list: a word seen with frequency f is in the bucket -100·log10(f),
 *              most frequent first; words below the file's zipfMin are left out.
 */
export interface JapaneseLevelsFile {
  meta?: Record<string, unknown>;
  jlpt: Array<[number, number, string, string]>;
  frequency: Array<[number, string[]]>;
}

interface JlptRow {
  level: number;
  /** The kanji spelling, or "" for a word written in kana. */
  kanji: string;
  /** The reading in hiragana. */
  reading: string;
}

export interface JapaneseLevels {
  meta: Record<string, unknown>;
  /** JMdict entry id -> its listed rows (one entry can be listed per reading, at different levels). */
  byEntry: Map<string, JlptRow[]>;
  /** A spelling (kanji, or kana for a word written in kana) -> its listed rows. */
  bySpelling: Map<string, JlptRow[]>;
  /** A word as wordfreq counts it -> its frequency. */
  frequency: Map<string, WordFrequency>;
}

export interface WordFrequency {
  /** 1 is the most frequent; words of the same frequency share a rank. */
  rank: number;
  /** log10 of the word's frequency per billion words: 7 is one in a hundred, 3 one in a million. */
  zipf: number;
}

export type JlptLevel = "N1" | "N2" | "N3" | "N4" | "N5";

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
);

const readingKey = (reading: string) => toHiragana(reading, {convertLongVowelMark: false}).replace(/[\s・]/g, "");

/** wordfreq's own normal form for Japanese: NFKC, letters in lower case. */
export const frequencyKey = (word: string) => word.normalize("NFKC").toLowerCase();

const push = <T>(map: Map<string, T[]>, key: string, value: T) => {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
};

/** The levels in a loaded words.json; null when it is not one. */
export const parseJapaneseLevels = (raw: unknown): JapaneseLevels | null => {
  if (!isRecord(raw) || !Array.isArray(raw.jlpt) || !Array.isArray(raw.frequency)) return null;
  const byEntry = new Map<string, JlptRow[]>();
  const bySpelling = new Map<string, JlptRow[]>();
  for (const row of raw.jlpt) {
    if (!Array.isArray(row) || row.length < 4) continue;
    const [id, level, kanji, kana] = row;
    if (!Number.isInteger(level) || level < 1 || level > 5 || typeof kanji !== "string" || typeof kana !== "string" || !kana) continue;
    const item: JlptRow = {level, kanji, reading: readingKey(kana)};
    if (Number.isInteger(id) && id > 0) push(byEntry, String(id), item);
    push(bySpelling, kanji || item.reading, item);
  }
  const frequency = new Map<string, WordFrequency>();
  let before = 0;
  for (const bucket of raw.frequency) {
    if (!Array.isArray(bucket) || !Number.isInteger(bucket[0]) || !Array.isArray(bucket[1])) continue;
    const [centibels, words] = bucket as [number, unknown[]];
    const zipf = Math.round(900 - centibels) / 100;
    for (const word of words) {
      if (typeof word === "string" && !frequency.has(word)) frequency.set(word, {rank: before + 1, zipf});
    }
    before += words.length;
  }
  return {meta: isRecord(raw.meta) ? raw.meta : {}, byEntry, bySpelling, frequency};
};

/** The easiest (highest N) level among rows, as "N5".."N1". */
const easiest = (rows: JlptRow[]): JlptLevel | undefined => {
  if (rows.length === 0) return undefined;
  return `N${Math.max(...rows.map((row) => row.level))}` as JlptLevel;
};

/** The rows' one level when they agree, else nothing (a reading decides between them). */
const agreed = (rows: JlptRow[]): JlptLevel | undefined => (
  new Set(rows.map((row) => row.level)).size === 1 ? easiest(rows) : undefined
);

export interface JlptQuery {
  /** The JMdict entry the word was matched to, when it was. */
  entryId?: string | number;
  /** The word as written (its dictionary form). */
  spelling: string;
  /** Its reading, in kana. */
  reading?: string;
}

/**
 * The JLPT level of a word. The lists can hold one JMdict entry at two levels, one per reading (今日 is
 * きょう at N5 and こんにち at N3), so the reading decides: the easiest level listed for the entry (else
 * the spelling) with that reading. Without a matching reading, the level is given only when all the
 * listed rows agree on it.
 */
export const lookupJlpt = (levels: JapaneseLevels | null, query: JlptQuery): JlptLevel | undefined => {
  if (!levels) return undefined;
  const wanted = query.reading ? readingKey(query.reading) : "";
  const pick = (rows: JlptRow[]) => {
    const read = wanted ? rows.filter((row) => row.reading === wanted) : [];
    return read.length > 0 ? easiest(read) : agreed(rows);
  };
  const entryRows = query.entryId !== undefined && query.entryId !== "" ? levels.byEntry.get(String(query.entryId)) : undefined;
  if (entryRows) {
    const spelled = entryRows.filter((row) => (row.kanji || row.reading) === query.spelling || (isKana(query.spelling) && row.reading === readingKey(query.spelling)));
    return pick(entryRows) ?? (spelled.length > 0 ? agreed(spelled) : undefined);
  }
  const spelling = query.spelling.normalize("NFC");
  const rows = levels.bySpelling.get(isKana(spelling) ? readingKey(spelling) : spelling);
  return rows ? pick(rows) : undefined;
};

/** The word's frequency in wordfreq's Japanese list, or undefined when it is rarer than the list keeps. */
export const lookupFrequency = (levels: JapaneseLevels | null, word: string): WordFrequency | undefined => (
  levels?.frequency.get(frequencyKey(word))
);

/** `levels` fields for a Japanese word: jlpt, freq_rank and freq_zipf, each only when known. */
export const japaneseLevelFields = (levels: JapaneseLevels | null, query: JlptQuery) => {
  const jlpt = lookupJlpt(levels, query);
  const frequency = lookupFrequency(levels, query.spelling);
  return {
    ...(jlpt ? {jlpt} : {}),
    ...(frequency ? {freq_rank: frequency.rank, freq_zipf: frequency.zipf} : {})
  };
};
