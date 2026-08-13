/**
 * TypeScript mirror of dictionary.schema.json.
 * Keep both in sync: the validator (validateDictionary.ts) enforces the schema.
 */

/** BCP-47-ish language code, e.g. en, ja, zh-CN, zh-Hans, yue, vi. */
export type LanguageCode = string;

export type Gloss = string | {
  text: string;
  lang?: LanguageCode;
};

export interface Sense {
  gloss: Gloss[];
  partOfSpeech?: string[];
  examples?: { text: string; translation?: string }[];
  info?: string[];
  related?: string[];
  dialect?: string[];
  field?: string[];
}

/** Common entry shape shared by every language. */
export interface DictionaryEntry {
  id: string | number;
  headword: string;
  readings?: string[];
  senses?: Sense[];
  tags?: string[];
  /** Frequency rank; lower means more frequent. */
  frequency?: number;
  japanese?: JapaneseExtension;
  mandarin?: MandarinExtension;
  cantonese?: CantoneseExtension;
}

export interface JapaneseKanjiForm {
  text: string;
  common?: boolean;
  tags?: string[];
}

export interface JapaneseKanaForm {
  text: string;
  common?: boolean;
  tags?: string[];
  /** Which kanji forms this kana applies to; ["*"] means all. */
  appliesToKanji?: string[];
}

export interface KanjiInfo {
  literal: string;
  strokeCount?: number;
  onYomi?: string[];
  kunYomi?: string[];
  meanings?: string[];
  jlpt?: number;
}

/** JMdict-flavoured data that only makes sense for Japanese. */
export interface JapaneseExtension {
  kanji?: JapaneseKanjiForm[];
  kana?: JapaneseKanaForm[];
  kanjiInfo?: KanjiInfo[];
}

/** CC-CEDICT-flavoured data for Mandarin. */
export interface MandarinExtension {
  simplified: string;
  traditional?: string;
  pinyin: string[];
}

/** CantoDict-flavoured data for Cantonese. */
export interface CantoneseExtension {
  jyutping: string[];
  simplified?: string;
  traditional?: string;
}

export interface DictionarySource {
  name?: string;
  url?: string;
  license?: string;
}

export interface DictionaryDocument {
  version: string;
  language: LanguageCode;
  name?: string;
  source?: DictionarySource;
  entries: DictionaryEntry[];
}

export type LanguageFamily = 'japanese' | 'mandarin' | 'cantonese' | null;
