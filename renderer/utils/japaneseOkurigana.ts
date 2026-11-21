/**
 * Splitting a Japanese word into kanji and kana parts, each with its reading, for furigana. Used by the
 * backend's analyzer (main/handler/languages/japaneseAnalysis.ts) and by the word popup, which reads
 * dictionary headwords with the kana JMdict gives them.
 */
import {isKanji, toHiragana, toRomaji} from "../../main/language/wanakana";
import {cacheTokenReading} from "../../main/language/wanakana/cacheTokenReading";
import {containsKana, containsKanji} from "../../main/language/wanakana/characters";

export interface MiteiruJapaneseSeparation {
  main: string;
  hiragana: string;
  romaji: string;
  isKana: boolean;
  isKanji: boolean;
  isMixed: boolean;
}

const tokenRomaji = cacheTokenReading(toRomaji);

const createStoredObject = (
  textMain: string,
  textHiragana: string,
  textSpoken: string = textHiragana
): MiteiruJapaneseSeparation => ({
  main: textMain,
  hiragana: textHiragana,
  romaji: tokenRomaji(textSpoken),
  isKana: containsKana(textMain),
  isKanji: containsKanji(textMain),
  // The stored flag tests each character for mixed scripts. No single character is both kana and romaji.
  isMixed: false
});

/**
 * @param spokenReading Optional kana aligned 1:1 with `reading`, used only for romaji.
 */
export const splitOkuriganaCompact = (text: string, reading?: string, spokenReading?: string): MiteiruJapaneseSeparation[] => {
  let hiragana = reading;
  if (typeof hiragana === "undefined") {
    hiragana = text;
  } else if (hiragana === "*") {
    hiragana = toHiragana(text);
  }
  const spoken = spokenReading?.length === hiragana.length ? spokenReading : hiragana;

  const stored: MiteiruJapaneseSeparation[] = [];
  let firstKanji = 0;
  while (firstKanji < text.length && !isKanji(text[firstKanji])) firstKanji++;
  let lastKanji = text.length - 1;
  while (lastKanji > firstKanji && !isKanji(text[lastKanji])) lastKanji--;

  const pushPart = (main: string, start: number, end: number) => {
    stored.push(createStoredObject(main, hiragana.substring(start, end), spoken.substring(start, end)));
  };

  if (firstKanji > 0) {
    pushPart(text.substring(0, firstKanji), 0, firstKanji);
  }

  if (firstKanji <= lastKanji) {
    const suffixLength = text.length - (lastKanji + 1);
    const suffixReadingStart = hiragana.length - suffixLength;
    pushPart(text.substring(firstKanji, lastKanji + 1), firstKanji, suffixReadingStart);
    if (suffixLength) pushPart(text.substring(lastKanji + 1), suffixReadingStart, hiragana.length);
  }

  return stored;
};
