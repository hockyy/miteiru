/**
 * Mandarin HSK 3.0 word levels (renderer/public/study-data/mandarin-hsk, MIT, from
 * drkameleon/complete-hsk-vocabulary): one map from every simplified and traditional form to its level.
 * Shared by the subtitles' HSK underlines (renderer/utils/mandarinHsk.ts) and the language tools.
 */

/** 7 is the standard's combined 7–9 band; see the asset README. */
export type HskLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type HskWords = Readonly<Record<string, HskLevel>>;

export const hskLabel = (level: HskLevel | null) => level === null ? 'Not in HSK' : level === 7 ? 'HSK 7–9' : `HSK ${level}`;

/** The word's level; null when it is not in HSK, undefined when there is no list or no Han in the word. */
export const lookupHsk = (words: HskWords | null, word: string): HskLevel | null | undefined => {
  if (!words || !/\p{Script=Han}/u.test(word)) return undefined;
  return words[word.trim().normalize('NFC')] ?? null;
};

/** The words of a loaded file, frozen; null when it is not a non-empty map of levels 1 to 7. */
export const parseHskWords = (raw: unknown): HskWords | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const entries = Object.entries(raw);
  if (!entries.length || !entries.every(([, level]) => Number.isInteger(level) && level >= 1 && level <= 7)) return null;
  return Object.freeze(Object.assign(Object.create(null), raw)) as HskWords;
};
