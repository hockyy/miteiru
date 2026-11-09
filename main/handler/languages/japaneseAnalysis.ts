import {toHiragana} from "wanakana";
import {splitOkuriganaCompact, type MiteiruJapaneseSeparation} from "../../../renderer/utils/japaneseOkurigana";

export {splitOkuriganaCompact};
export type {MiteiruJapaneseSeparation};

export interface MiteiruJapaneseWord {
  origin: string;
  hiragana: string;
  basicForm: string;
  pos: string;
}


export interface MiteiruJapaneseWordWithSeparations extends MiteiruJapaneseWord {
  separation: MiteiruJapaneseSeparation[];
}

export interface KuromojinWord {
  word_id: number;
  word_type: string;
  word_position: number;
  surface_form: string;
  pos: string;
  pos_detail_1: string;
  pos_detail_2: string;
  pos_detail_3: string;
  conjugated_type: string;
  conjugated_form: string;
  basic_form: string;
  reading?: string;
  pronunciation?: string;
}


// Unknown words have no reading; keep the old empty-reading behavior for them.
const kuromojiReading = (item: KuromojinWord): string => item.reading ?? item.pronunciation ?? "";

/**
 * Kuromoji's `pronunciation` is the spoken form (ハ → ワ, オオキイ → オーキイ).
 * Romaji keeps its sound changes but not its long-vowel marks, which would
 * otherwise read 大きい as "oukii" and 先生 as "sensee".
 */
const spokenKana = (reading: string, pronunciation?: string): string => {
  const written = Array.from(reading);
  const spoken = Array.from(pronunciation ?? "");
  if (spoken.length !== written.length) return reading;
  return written.map((char, index) => (spoken[index] === "ー" ? char : spoken[index])).join("");
};

// Furigana follows the dictionary reading; ー stays as written (ホーム → ほーむ, not ほうむ).
const toFuriganaHiragana = (kana: string): string => toHiragana(kana, {convertLongVowelMark: false});

export const kuromojinToJapaneseWords = (texts: KuromojinWord[]): MiteiruJapaneseWord[] => texts.map((item) => ({
  origin: item.surface_form,
  hiragana: toFuriganaHiragana(kuromojiReading(item)),
  basicForm: item.basic_form,
  pos: item.pos
    + (item.pos_detail_1 !== "*" ? `-${item.pos_detail_1}` : "")
    + (item.pos_detail_2 !== "*" ? `-${item.pos_detail_2}` : "")
    + (item.pos_detail_3 !== "*" ? `-${item.pos_detail_3}` : "")
}));

export const processKuromojinToSeparations = (
  texts: KuromojinWord[]
): MiteiruJapaneseWordWithSeparations[] => kuromojinToJapaneseWords(texts).map((word, index) => ({
  ...word,
  separation: splitOkuriganaCompact(
    word.origin,
    word.hiragana,
    spokenKana(kuromojiReading(texts[index]), texts[index].pronunciation)
  )
}));
