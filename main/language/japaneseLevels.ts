import {toHiragana} from "wanakana";

/**
 * Japanese word levels for the language tools: a JLPT level (N5 easiest to N1) and a frequency rank
 * (1 is the most frequent word). Built by scripts/data/buildJapaneseLevels.ts into
 * renderer/public/study-data/japanese-levels/words.json; its README names the sources and licences.
 *
 *   jlpt: spelling -> kana reading -> level 1..5 (N1..N5); a kana-only word is listed under its kana
 *   rank: spelling -> rank
 */
export interface JapaneseLevels {
  meta?: Record<string, unknown>;
  jlpt: Record<string, Record<string, number>>;
  rank: Record<string, number>;
}

export type JlptLevel = "N1" | "N2" | "N3" | "N4" | "N5";

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
);

/** The levels of a loaded file; null when it is not one. */
export const parseJapaneseLevels = (raw: unknown): JapaneseLevels | null => {
  if (!isRecord(raw) || !isRecord(raw.jlpt) || !isRecord(raw.rank)) return null;
  return raw as unknown as JapaneseLevels;
};

const readingKey = (reading: string) => toHiragana(reading, {convertLongVowelMark: false}).replace(/[\s・]/g, "");

/**
 * The JLPT level of a word spelled `spelling` and read `reading`: the listed reading when one matches,
 * else the spelling's only listed level (its readings all at one level). A spelling listed at two
 * levels for different readings answers only for a matching reading.
 */
export const lookupJlpt = (levels: JapaneseLevels | null, spelling: string, reading = ""): JlptLevel | undefined => {
  const readings = levels?.jlpt[spelling];
  if (!readings || !isRecord(readings)) return undefined;
  const wanted = reading ? readingKey(reading) : "";
  const exact = wanted ? readings[wanted] : undefined;
  const distinct = [...new Set(Object.values(readings))];
  const level = exact ?? (distinct.length === 1 ? distinct[0] : undefined);
  return Number.isInteger(level) && level >= 1 && level <= 5 ? `N${level}` as JlptLevel : undefined;
};

/** The word's frequency rank (1 is the most frequent), or undefined when it is not in the list. */
export const lookupFrequencyRank = (levels: JapaneseLevels | null, spelling: string): number | undefined => {
  const rank = levels?.rank[spelling];
  return Number.isInteger(rank) && rank > 0 ? rank : undefined;
};
