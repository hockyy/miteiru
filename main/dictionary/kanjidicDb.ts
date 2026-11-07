import {DictionaryDb, DictionaryImport, getJsonRecord, openDictionary} from "./levelDictionary";

/** A KANJIDIC2 character from kanjidic2-simplified; the renderer reads the remaining fields. */
export interface KanjidicCharacter {
  literal: string;
  [field: string]: unknown;
}

export interface KanjidicFile {
  version: string;
  dictDate: string;
  characters: KanjidicCharacter[];
}

/*
 * Key layout (same as kanjidic-wrapper):
 *   raw/characters/<literal>     character JSON
 *   raw/dictDate, raw/version    written last
 */
export const kanjidicImport: DictionaryImport<KanjidicFile> = {
  metadataKeys: ["raw/dictDate", "raw/version"],
  // Development builds import in Rust (src-tauri/src/sys/dict_import.rs): change both. Packaged
  // builds read a table that scripts/data/buildDictionaryTables.ts makes with writeEntries.
  nativeLayout: "kanjidic",
  writeEntries: async (raw, writer) => {
    for (const character of raw.characters) {
      await writer.put(`raw/characters/${character.literal}`, JSON.stringify(character));
    }
  },
  metadata: (raw) => ({"raw/dictDate": raw.dictDate, "raw/version": raw.version})
};

export const setupKanjidic = async (dbPath: string, importPath = "") => {
  const {db, metadata} = await openDictionary<KanjidicFile>(dbPath, importPath, kanjidicImport);
  return {db, dictDate: metadata["raw/dictDate"], version: metadata["raw/version"]};
};

/** The KANJIDIC entry for one kanji, or undefined when it has none. */
export const searchKanji = (db: DictionaryDb, literal: string) =>
  getJsonRecord<KanjidicCharacter>(db, `raw/characters/${literal}`);
