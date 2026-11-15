import {convert} from "pinyin-pro";

/**
 * How subtitles show Mandarin and Cantonese tones, by the learner's "Tone numbers" setting (store
 * `toneType`, Video settings): `num` shows tone numbers (ni3 hao3, nei5 hou2), `symbol` shows tone
 * marks (nǐ hǎo, and Cantonese's contour marks nei⸝₅ hou⸍²). The language tools always read both
 * forms machine-stable from main/language/readings.ts instead.
 */

/** Mandarin contour+number marks, parallel to Jyutping's CANTONESE_TONE_MARKS. */
export const PINYIN_TONE_MAP: Record<string, string> = {
  "1": "ˉ¹",
  "2": "⸍²",
  "3": "ᵛ₃",
  "4": "⸌₄",
  "5": "·₅",
  "0": "·₅",
};

/** Cantonese contour marks, the only tone marks Jyutping has: sik6 is sikˍ₆. */
export const CANTONESE_TONE_MARKS: Record<string, string> = {
  "1": "ˉ¹",
  "2": "⸍²",
  "3": "-₃",
  "4": "⸜₄",
  "5": "⸝₅",
  "6": "ˍ₆",
};

export function replacePinyinToneSymbol(syllable: string): string {
  if (!syllable) {
    return "";
  }
  const tone = syllable.slice(-1);
  if (PINYIN_TONE_MAP[tone]) {
    return syllable.slice(0, -1) + PINYIN_TONE_MAP[tone];
  }
  return syllable;
}

/** Standard pinyin with diacritics on vowels: ni3 → nǐ */
export function toPinyinToneMarks(syllable: string): string {
  if (!syllable) {
    return "";
  }
  const converted = convert(syllable, {format: "numToSymbol"});
  // Neutral tone (5/0) is not a diacritic; pinyin-pro may leave the digit.
  return converted.replace(/[05]$/, "");
}

/** A numbered pinyin syllable as the setting shows it: ni3 for `num` (neutral ma5), nǐ for `symbol`. */
export function formatPinyinReading(syllable: string, toneType: string): string {
  if (!syllable) return "";
  if (toneType === "symbol") {
    return toPinyinToneMarks(syllable);
  }
  return syllable.replace(/0$/, "5");
}

/** A numbered Jyutping syllable as the setting shows it: nei5 for `num`, nei⸝₅ for `symbol`. */
export function formatJyutpingReading(syllable: string | null | undefined, toneType: string): string | null {
  if (!syllable) return syllable ?? null;
  if (toneType !== "symbol") return syllable;
  const tone = syllable.slice(-1);
  return CANTONESE_TONE_MARKS[tone] ? syllable.slice(0, -1) + CANTONESE_TONE_MARKS[tone] : syllable;
}
