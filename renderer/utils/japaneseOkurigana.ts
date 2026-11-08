/**
 * Splitting a Japanese word into kanji and kana parts, each with its reading, for furigana. Used by the
 * backend's analyzer (main/handler/languages/japaneseAnalysis.ts) and by the word popup, which reads
 * dictionary headwords with the kana JMdict gives them.
 */
import {isKana, isKanji, isMixed, toHiragana, toRomaji} from "wanakana";

export interface MiteiruJapaneseSeparation {
  main: string;
  hiragana: string;
  romaji: string;
  isKana: boolean;
  isKanji: boolean;
  isMixed: boolean;
}

const anyOneTrue = (word: string, func: (value: string) => boolean) => {
  for (const ch of word) {
    if (func(ch)) return true;
  }
  return false;
};

const createStoredObject = (
  textMain: string,
  textHiragana: string,
  textSpoken: string = textHiragana
): MiteiruJapaneseSeparation => ({
  main: textMain,
  hiragana: textHiragana,
  romaji: toRomaji(textSpoken),
  isKana: anyOneTrue(textMain, isKana),
  isKanji: anyOneTrue(textMain, isKanji),
  isMixed: anyOneTrue(textMain, isMixed)
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

  const kanjiPointer = [text.length, -1];
  const stored: MiteiruJapaneseSeparation[] = [];

  for (let i = 0; i < text.length + 1; i++) {
    kanjiPointer[0] = i;
    if (i === text.length + 1 || isKanji(text[i])) break;
  }

  for (let i = text.length - 1; i >= 0; i--) {
    kanjiPointer[1] = i;
    if (i === -1 || isKanji(text[i])) break;
  }

  const pushPart = (main: string, start: number, end: number) => {
    stored.push(createStoredObject(main, hiragana.substring(start, end), spoken.substring(start, end)));
  };

  if (kanjiPointer[0] > 0) {
    pushPart(text.substring(0, kanjiPointer[0]), 0, kanjiPointer[0]);
  }

  if (kanjiPointer[0] <= kanjiPointer[1]) {
    const spentBack = text.length - kanjiPointer[1];
    pushPart(
      text.substring(kanjiPointer[0], kanjiPointer[1] + 1),
      kanjiPointer[0],
      hiragana.length - spentBack + 1
    );
  }

  if (kanjiPointer[0] <= kanjiPointer[1] && kanjiPointer[1] + 1 !== text.length) {
    const spentBack = text.length - kanjiPointer[1];
    pushPart(
      text.substring(kanjiPointer[1] + 1, text.length),
      hiragana.length - spentBack + 1,
      hiragana.length
    );
  }

  return stored;
};
