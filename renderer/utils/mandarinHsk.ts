import type {CSSProperties} from 'react';

/** 7 is the standard's combined 7–9 band; see the asset README. */
export type HskLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type HskWords = Readonly<Record<string, HskLevel>>;
export const MANDARIN_HSK_URL = '/study-data/mandarin-hsk/words.json';
export const HSK_COLORS: Record<HskLevel, string> = {
  1: '#86efac', 2: '#5eead4', 3: '#7dd3fc', 4: '#a5b4fc', 5: '#d8b4fe', 6: '#f9a8d4', 7: '#fda4af',
};
export const HSK_UNLISTED_COLOR = '#cbd5e1';
export const hskLabel = (level: HskLevel | null) => level === null ? 'Not in HSK' : level === 7 ? 'HSK 7–9' : `HSK ${level}`;

export const lookupHsk = (words: HskWords | null, word: string): HskLevel | null | undefined => {
  if (!words || !/\p{Script=Han}/u.test(word)) return undefined;
  return words[word.trim().normalize('NFC')] ?? null;
};

/** The advanced band remains visible until the learner knows all of levels 7–9. */
export const hskUnderline = (level: HskLevel | null | undefined, above = 0): CSSProperties | undefined => {
  if (level === undefined || (level !== null && (level === 7 ? 9 : level) <= above)) return undefined;
  return {
    textDecorationLine: 'underline',
    textDecorationColor: level === null ? HSK_UNLISTED_COLOR : HSK_COLORS[level],
    textDecorationStyle: level === null ? 'dashed' : 'solid',
    textDecorationThickness: '0.07em',
    textUnderlineOffset: '0.12em',
    textDecorationSkipInk: 'none',
  };
};

/** Shared, including a failed load: missing data must not trigger a request for every word/popup. */
export const createHskLoader = (fetcher: typeof fetch = (input, init) => fetch(input, init)) => {
  let pending: Promise<HskWords | null> | undefined;
  return () => pending ??= (async () => {
    try {
      const response = await fetcher(MANDARIN_HSK_URL);
      if (!response.ok) return null;
      const raw: unknown = await response.json();
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
      const entries = Object.entries(raw);
      if (!entries.length || !entries.every(([, level]) => Number.isInteger(level) && level >= 1 && level <= 7)) return null;
      return Object.freeze(Object.assign(Object.create(null), raw)) as HskWords;
    } catch {return null;}
  })();
};

export const loadMandarinHsk = createHskLoader();
