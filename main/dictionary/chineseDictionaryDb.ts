import {allSubstrings, DictionaryDb, getJsonRecords, openDictionary, valuesWithPrefix} from "./levelDictionary";

/** A CC-CEDICT / CantoDict word or character entry; the renderer reads the remaining fields. */
export interface ChineseEntry {
  id: string;
  content: string;
  simplified?: string;
  [field: string]: unknown;
}

export interface ChineseDictionaryFile {
  version: string;
  words: ChineseEntry[];
  characters: ChineseEntry[];
}

const PARTIAL_INDEX = "partial/";

/**
 * Storage ids for entries in file order. cantodict.json's character list is two lists whose ids
 * both start at 0, so a repeated id gets a suffix instead of overwriting the earlier record
 * (cc-chinese-wrapper lost 2,264 CantoDict characters, among them 我, 四 and 家, that way).
 */
const storageIds = (entries: ChineseEntry[]) => {
  const used = new Set<string>();
  return entries.map((entry, index) => {
    const id = used.has(entry.id) ? `${entry.id}~${index}` : entry.id;
    used.add(id);
    return id;
  });
};

/*
 * Key layout (cc-chinese-wrapper's, with ids made unique as above):
 *   raw/words/<id>, raw/char/<id>          entry JSON
 *   indexes/<content|simplified>-<id>      → word id
 *   partial/<substring>-<id>               → word id, for every substring of either form
 *   indexchar/<content>-<id>               → character id
 *   raw/version                            written last
 * cc-chinese-wrapper kept the substring index under indexes/partial/, where a Latin prefix
 * like "pa" scanned into it, and built it with substring(start, length), which skipped most
 * non-prefix substrings.
 */
export const setupChineseDictionary = async (dbPath: string, importPath = "") => {
  const {db, metadata} = await openDictionary<ChineseDictionaryFile>(dbPath, importPath, {
    metadataKeys: ["raw/version"],
    writeEntries: async (raw, writer) => {
      const wordIds = storageIds(raw.words);
      for (const [index, word] of raw.words.entries()) {
        const id = wordIds[index];
        await writer.put(`raw/words/${id}`, JSON.stringify(word));
        const forms = new Set([word.content, word.simplified].filter(Boolean));
        const substrings = new Set<string>();
        for (const form of forms) {
          await writer.put(`indexes/${form}-${id}`, id);
          allSubstrings(form).forEach((substring) => substrings.add(substring));
        }
        for (const substring of substrings) await writer.put(`${PARTIAL_INDEX}${substring}-${id}`, id);
      }
      const characterIds = storageIds(raw.characters);
      for (const [index, character] of raw.characters.entries()) {
        const id = characterIds[index];
        await writer.put(`raw/char/${id}`, JSON.stringify(character));
        await writer.put(`indexchar/${character.content}-${id}`, id);
      }
    },
    metadata: (raw) => ({"raw/version": raw.version})
  });
  return {db, version: metadata["raw/version"]};
};

const wordsForIds = (db: DictionaryDb, ids: string[]) =>
  getJsonRecords<ChineseEntry>(db, ids.map((id) => `raw/words/${id}`));

/** Words whose traditional or simplified form starts with `prefix`. */
export const charBeginning = async (db: DictionaryDb, prefix: string, limit = -1) =>
  wordsForIds(db, await valuesWithPrefix(db, `indexes/${prefix}`, limit));

/** Words that contain `text` anywhere in either form. */
export const charAnywhere = async (db: DictionaryDb, text: string, limit = -1) =>
  wordsForIds(db, await valuesWithPrefix(db, `${PARTIAL_INDEX}${text}`, limit));

/** Single-character entries (decomposition, etymology, strokes) for `character`. */
export const hanzi = async (db: DictionaryDb, character: string, limit = -1) => {
  const ids = await valuesWithPrefix(db, `indexchar/${character}`, limit);
  return getJsonRecords<ChineseEntry>(db, ids.map((id) => `raw/char/${id}`));
};
