import type {KuromojiToken} from 'kuromoji';

type Features = [string, string, string, string, string, string];
type Word = [number, string, number, string, number, string, string | null, string | null];

/** Decode the native transport's shared POS/conjugation table into ordinary token objects. */
export const decodeJapaneseTokenBatch = (bytes: ArrayBuffer): KuromojiToken[][] => {
  const {features, tokens} = JSON.parse(new TextDecoder().decode(bytes)) as {features: Features[]; tokens: Word[][]};
  if (!Array.isArray(features) || !Array.isArray(tokens)) throw new Error('Invalid Japanese token batch');
  return tokens.map((line) => line.map((word) => {
    const f = features[word[4]];
    if (!Array.isArray(word) || word.length !== 8 || !Array.isArray(f) || f.length !== 6) throw new Error('Invalid Japanese token features');
    return {
      word_id: word[0], word_type: word[1], word_position: word[2], surface_form: word[3],
      pos: f[0], pos_detail_1: f[1], pos_detail_2: f[2], pos_detail_3: f[3],
      conjugated_type: f[4], conjugated_form: f[5], basic_form: word[5],
      ...(word[6] === null ? {} : {reading: word[6]}),
      ...(word[7] === null ? {} : {pronunciation: word[7]}),
    };
  }));
};
