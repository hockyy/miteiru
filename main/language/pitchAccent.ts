/**
 * Japanese pitch accent lookup and classification, shared by the word popup (renderer/utils/pitchAccent.ts
 * loads the data by URL) and the language tools (main/language/studyData.ts reads it from disk).
 *
 * Data: renderer/public/language-assets/japanese/pitch/accents.json
 * extracted from Kanjium (CC BY-SA 4.0) by scripts/buildPitchAccentData.js.
 * Accent numbers follow the NHK convention: 0 = heiban (no downstep),
 * otherwise the 1-based mora index after which the pitch drops.
 */

export type PitchAccentMap = {
  meta?: {
    source?: string;
    license?: string;
    generatedAt?: string;
  };
  words: Record<string, Record<string, number[]>>;
};

export type PitchPattern = 'heiban' | 'atamadaka' | 'nakadaka' | 'odaka';

export const PITCH_PATTERN_LABEL: Record<PitchPattern, string> = {
  heiban: '平板',
  atamadaka: '頭高',
  nakadaka: '中高',
  odaka: '尾高',
};

export const PITCH_PATTERN_EN: Record<PitchPattern, string> = {
  heiban: 'heiban (flat)',
  atamadaka: 'atamadaka (head-high)',
  nakadaka: 'nakadaka (middle-high)',
  odaka: 'odaka (tail-high)',
};

/** Whether a following particle stays high — only heiban keeps it high. */
export const isParticleHigh = (accent: number): boolean => accent === 0;

const SMALL_KANA = new Set([
  ...'ぁぃぅぇぉゃゅょゎゕゖ',
  ...'ァィゥェォャュョヮヵヶ',
]);

export const toHiraganaSafe = (text: string): string =>
  text.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));

/** Splits a kana reading into morae (small kana attach to the previous mora). */
export const splitIntoMorae = (reading: string): string[] => {
  const morae: string[] = [];
  for (const ch of reading) {
    if (SMALL_KANA.has(ch) && morae.length > 0) {
      morae[morae.length - 1] += ch;
    } else {
      morae.push(ch);
    }
  }
  return morae;
};

/** Classifies an accent number given the word's mora count. */
export const classifyAccent = (accent: number, moraCount: number): PitchPattern => {
  if (accent <= 0) return 'heiban';
  if (accent === 1) return 'atamadaka';
  if (moraCount > 1 && accent === moraCount) return 'odaka';
  return 'nakadaka';
};

/** Whether the given (1-based) mora is high for the accent number. */
export const isMoraHigh = (accent: number, moraIndex: number): boolean => {
  if (moraIndex < 1) return false;
  if (accent <= 0) return moraIndex > 1;
  if (accent === 1) return moraIndex === 1;
  return moraIndex > 1 && moraIndex <= accent;
};

/**
 * Looks up accent numbers for a surface form + hiragana reading.
 * Falls back to the reading itself for kana-only headwords.
 */
export const lookupPitchAccent = (
  map: PitchAccentMap,
  surface: string,
  reading: string,
): number[] | null => {
  if (!map?.words) return null;
  const normalizedReading = toHiraganaSafe(reading).replace(/[\s・]/g, '');
  const direct = map.words[surface]?.[normalizedReading];
  if (direct?.length) return direct;
  const kanaOnly = map.words[normalizedReading]?.[normalizedReading];
  if (kanaOnly?.length) return kanaOnly;
  return null;
};

/** The map, or null when `raw` is not one (a missing or damaged file). */
export const parsePitchAccentMap = (raw: unknown): PitchAccentMap | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const words = (raw as {words?: unknown}).words;
  if (!words || typeof words !== 'object' || Array.isArray(words)) return null;
  return raw as PitchAccentMap;
};
