/**
 * In-house port of wanakana 5.3.1 by WaniKani Community Github (https://github.com/WaniKani/WanaKana), MIT; see ./LICENSE.
 *
 * Local changes from upstream:
 * - Ported the conversion tables, mapping functions and character checks to strict TypeScript.
 * - Kept the eight functions used by Miteiru and the convertLongVowelMark and passRomaji options.
 * - Removed IME and DOM helpers, custom maps, obsolete kana, uppercase katakana and unused exports.
 * - Cached only the default mapping trees and joined completed chunks without retaining input offsets.
 */
import {
  HIRAGANA_START, KATAKANA_START, isCharEnglishPunctuation, isCharHiragana,
  isCharKatakana, isMixed, isRomaji,
} from "./characters";
import {applyMapping} from "./kanaMapping";
import {getKanaToHepburnTree} from "./kanaToRomajiMap";
import {getRomajiToKanaTree} from "./romajiToKanaMap";

export {isHiragana, isKana, isKanji, isKatakana, isMixed} from "./characters";

const LONG_VOWELS: Record<string, string> = {a: "あ", i: "い", u: "う", e: "え", o: "う"};

function katakanaToHiragana(input: string, convertLongVowelMark: boolean, isDestinationRomaji: boolean): string {
  let previousKana = "";
  let hiragana = "";
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (char === "・" || (char === "ー" && index === 0) || char === "ヶ" || char === "ヵ") {
      hiragana += char;
    } else if (convertLongVowelMark && previousKana && char === "ー") {
      const vowel = toRomaji(previousKana).slice(-1);
      // オー becomes おう on its own, but おお on the way to romaji.
      hiragana += isDestinationRomaji && isCharKatakana(input[index - 1]) && vowel === "o"
        ? "お" : LONG_VOWELS[vowel] ?? "";
    } else if (char !== "ー" && isCharKatakana(char)) {
      previousKana = String.fromCharCode(char.charCodeAt(0) + HIRAGANA_START - KATAKANA_START);
      hiragana += previousKana;
    } else {
      previousKana = "";
      hiragana += char;
    }
  }
  return hiragana;
}

function hiraganaToKatakana(input: string): string {
  let katakana = "";
  for (const char of input) {
    if (char !== "ー" && isCharHiragana(char)) {
      katakana += String.fromCharCode(char.charCodeAt(0) + KATAKANA_START - HIRAGANA_START);
    } else {
      katakana += char;
    }
  }
  return katakana;
}

// Both callers pass lowercase text to upstream's toKana.
function toKana(input: string): string {
  return applyMapping(input.toLowerCase(), getRomajiToKanaTree());
}

export function toHiragana(input = "", {convertLongVowelMark = true} = {}): string {
  if (isMixed(input)) {
    return toKana(katakanaToHiragana(input, convertLongVowelMark, false));
  }
  if (isRomaji(input) || isCharEnglishPunctuation(input)) return toKana(input);
  return katakanaToHiragana(input, convertLongVowelMark, false);
}

export function toKatakana(input = "", {passRomaji = false} = {}): string {
  if (!passRomaji && (isMixed(input) || isRomaji(input) || isCharEnglishPunctuation(input))) {
    return hiraganaToKatakana(toKana(input));
  }
  return hiraganaToKatakana(input);
}

export function toRomaji(input = ""): string {
  return applyMapping(katakanaToHiragana(input, true, true), getKanaToHepburnTree());
}
