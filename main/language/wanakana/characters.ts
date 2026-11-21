export const HIRAGANA_START = 0x3041;
export const KATAKANA_START = 0x30a1;
const HIRAGANA_END = 0x3096;
const KATAKANA_END = 0x30fc;

// These are WanaKana's BMP ranges, including its U+9FAF upper bound for kanji.
// ー counts as both hiragana and katakana. ASCII punctuation counts as romaji.
const HIRAGANA = /^[ぁ-ゖー]+$/;
const KATAKANA = /^[ァ-ー]+$/;
const KANA = /^[ぁ-ゖァ-ー]+$/;
const KANJI = /^[\u4e00-\u9faf々]+$/;
const ROMAJI = /^[\x00-\x7fĀāĒēĪīŌōŪū]+$/;
const ANY_KANA = /[ぁ-ゖァ-ー]/;
const ANY_KANJI = /[\u4e00-\u9faf々]/;
const ANY_KATAKANA = /[ァ-ー]/;
const ANY_ROMAJI = /[\x00-\x7fĀāĒēĪīŌōŪū]/;
const STARTS_WITH_ENGLISH_PUNCTUATION = /^[\x20-\x2f\x3a-\x3f\x5b-\x60\x7b-\x7e‘’“”]/;

function isCharInRange(char: string, start: number, end: number): boolean {
  const code = char.charCodeAt(0);
  return start <= code && code <= end;
}

export const isCharHiragana = (char: string) => char === "ー" || isCharInRange(char, HIRAGANA_START, HIRAGANA_END);
export const isCharKatakana = (char: string) => isCharInRange(char, KATAKANA_START, KATAKANA_END);
export const isCharEnglishPunctuation = (input: string) => STARTS_WITH_ENGLISH_PUNCTUATION.test(input);
export const containsKana = (input: string) => ANY_KANA.test(input);
export const containsKanji = (input: string) => ANY_KANJI.test(input);
export const containsKatakana = (input: string) => ANY_KATAKANA.test(input);

export const isHiragana = (input = "") => typeof input === "string" && HIRAGANA.test(input);
export const isKatakana = (input = "") => typeof input === "string" && KATAKANA.test(input);
export const isKana = (input = "") => typeof input === "string" && KANA.test(input);
export const isKanji = (input = "") => typeof input === "string" && KANJI.test(input);
export const isRomaji = (input: string) => ROMAJI.test(input);
export const isMixed = (input = "") => input.length > 1 && ANY_ROMAJI.test(input) && containsKana(input);
