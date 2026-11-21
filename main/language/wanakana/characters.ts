export const HIRAGANA_START = 0x3041;
export const KATAKANA_START = 0x30a1;
const HIRAGANA_END = 0x3096;
const KATAKANA_END = 0x30fc;
const KANJI_START = 0x4e00;
const KANJI_END = 0x9faf;

const ROMAJI_RANGES = [
  [0x0000, 0x007f], // ASCII
  [0x0100, 0x0101], // Ā ā
  [0x0112, 0x0113], // Ē ē
  [0x012a, 0x012b], // Ī ī
  [0x014c, 0x014d], // Ō ō
  [0x016a, 0x016b], // Ū ū
];
const EN_PUNCTUATION_RANGES = [
  [0x20, 0x2f], [0x3a, 0x3f], [0x5b, 0x60], [0x7b, 0x7e],
  [0x2018, 0x2019], [0x201c, 0x201d],
];

function isCharInRange(char: string, start: number, end: number): boolean {
  const code = char.charCodeAt(0);
  return start <= code && code <= end;
}

export const isCharHiragana = (char: string) => char === "ー" || isCharInRange(char, HIRAGANA_START, HIRAGANA_END);
export const isCharKatakana = (char: string) => isCharInRange(char, KATAKANA_START, KATAKANA_END);
const isCharKana = (char: string) => isCharHiragana(char) || isCharKatakana(char);
const isCharKanji = (char: string) => isCharInRange(char, KANJI_START, KANJI_END) || char === "々";
const isCharRomaji = (char: string) => ROMAJI_RANGES.some(([start, end]) => isCharInRange(char, start, end));
export const isCharEnglishPunctuation = (char: string) =>
  EN_PUNCTUATION_RANGES.some(([start, end]) => isCharInRange(char, start, end));

function everyChar(input: string, predicate: (char: string) => boolean): boolean {
  return typeof input === "string" && input.length > 0 && [...input].every(predicate);
}

export const isHiragana = (input = "") => everyChar(input, isCharHiragana);
export const isKatakana = (input = "") => everyChar(input, isCharKatakana);
export const isKana = (input = "") => everyChar(input, isCharKana);
export const isKanji = (input = "") => everyChar(input, isCharKanji);
export const isRomaji = (input: string) => everyChar(input, isCharRomaji);

export function isMixed(input = ""): boolean {
  const chars = [...input];
  return chars.some(isCharKana) && chars.some(isCharRomaji);
}
