import {DictionaryDb, getJsonRecords, openDictionary, valuesWithPrefix} from "./levelDictionary";

// Types for jmdict-simplified (https://github.com/scriptin/jmdict-simplified), as in jmdict-wrapper 1.1.2.
export type JmdictTag = string;

export interface JmdictKanji {
  common: boolean;
  text: string;
  tags: JmdictTag[];
}

export interface JmdictKana {
  common: boolean;
  text: string;
  tags: JmdictTag[];
  appliesToKanji: string[];
}

export type JmdictXref = [string, string, number] | [string, number] | [string];

export interface JmdictGloss {
  lang: string;
  text: string;
  type: "literal" | "figurative" | "explanation" | null;
}

export interface JmdictSense {
  partOfSpeech: JmdictTag[];
  appliesToKanji: string[];
  appliesToKana: string[];
  related: JmdictXref[];
  antonym: JmdictXref[];
  field: JmdictTag[];
  dialect: JmdictTag[];
  misc: JmdictTag[];
  info: string[];
  languageSource: { lang: string; full: boolean; wasei: boolean; text?: string }[];
  gloss: JmdictGloss[];
}

export interface JmdictWord {
  id: string;
  kanji: JmdictKanji[];
  kana: JmdictKana[];
  sense: JmdictSense[];
}

export interface JmdictFile {
  version: string;
  dictDate: string;
  dictRevisions: string[];
  tags: Record<string, string>;
  words: JmdictWord[];
}

/*
 * Key layout (same as jmdict-wrapper):
 *   raw/words/<id>                   word JSON
 *   indexes/kana/<text>-<id>         → id
 *   indexes/kanji/<text>-<id>        → id
 *   raw/tags, raw/dictRevisions      JSON
 *   raw/dictDate, raw/version        written last
 * jmdict-wrapper also wrote indexes/partial-kana|kanji/<substring>-<id>. Nothing reads them,
 * so imports skip them (about 7.6M keys: half the size and a fraction of the import time).
 */
export const setupJmdict = async (dbPath: string, importPath = "") => {
  const {db, metadata} = await openDictionary<JmdictFile>(dbPath, importPath, {
    metadataKeys: ["raw/dictDate", "raw/version"],
    writeEntries: async (raw, writer) => {
      await writer.put("raw/tags", JSON.stringify(raw.tags));
      await writer.put("raw/dictRevisions", JSON.stringify(raw.dictRevisions));
      for (const word of raw.words) {
        await writer.put(`raw/words/${word.id}`, JSON.stringify(word));
        for (const kana of word.kana) await writer.put(`indexes/kana/${kana.text}-${word.id}`, word.id);
        for (const kanji of word.kanji) await writer.put(`indexes/kanji/${kanji.text}-${word.id}`, word.id);
      }
    },
    metadata: (raw) => ({"raw/dictDate": raw.dictDate, "raw/version": raw.version})
  });
  return {db, dictDate: metadata["raw/dictDate"], version: metadata["raw/version"]};
};

const searchBeginning = async (db: DictionaryDb, index: "kana" | "kanji", prefix: string, limit: number) => {
  const ids = await valuesWithPrefix(db, `indexes/${index}/${prefix}`, limit);
  return getJsonRecords<JmdictWord>(db, ids.map((id) => `raw/words/${id}`));
};

/** Words with a kana reading that starts with `prefix`, in index order. */
export const readingBeginning = (db: DictionaryDb, prefix: string, limit = -1) =>
  searchBeginning(db, "kana", prefix, limit);

/** Words with a kanji spelling that starts with `prefix`, in index order. */
export const kanjiBeginning = (db: DictionaryDb, prefix: string, limit = -1) =>
  searchBeginning(db, "kanji", prefix, limit);

/** JMdict tag code → description, e.g. "v5r" → "Godan verb with 'ru' ending". */
export const getJmdictTags = async (db: DictionaryDb): Promise<Record<string, string>> =>
  JSON.parse((await db.get("raw/tags")) ?? "{}");
