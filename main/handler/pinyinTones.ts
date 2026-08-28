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

export function formatPinyinReading(syllable: string, toneType: string): string {
  if (toneType === "symbol") {
    return replacePinyinToneSymbol(syllable);
  }
  return syllable;
}
