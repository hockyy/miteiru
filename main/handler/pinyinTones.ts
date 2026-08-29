import {convert} from "pinyin-pro";

/** Mandarin contour+number marks, parallel to Jyutping dcToneMap. */
export const PINYIN_TONE_MAP: Record<string, string> = {
  "1": "ˉ¹",
  "2": "⸍²",
  "3": "ᵛ₃",
  "4": "⸌₄",
  "5": "·₅",
  "0": "·₅",
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

export function formatPinyinReading(syllable: string, toneType: string): string {
  if (toneType === "symbol") {
    return toPinyinToneMarks(syllable);
  }
  return replacePinyinToneSymbol(syllable);
}
