/*
 * Builds the dictionary tables of a staged app directory (scripts/compressLanguageAssets.js runs this
 * through tsx): each dictionary's JSON becomes an MTRPACK2 table beside it (`jmdict.json` becomes
 * `jmdict.pack`) holding the keys its import writes into the store, and the JSON (and any gzip of
 * it) is removed. Prints one JSON line with the results.
 *
 *   npx tsx scripts/data/buildDictionaryTables.ts <language-assets directory>
 *
 * Adding a dictionary: an import definition (main/dictionary/*Db.ts) and one entry in DICTIONARIES.
 */
import fs from "node:fs";
import path from "node:path";
import {scan, get, clearTableCaches} from "../../main/helpers/dataTable";
import {chineseImport} from "../../main/dictionary/chineseDictionaryDb";
import {jmdictImport} from "../../main/dictionary/jmdictDb";
import {kanjidicImport} from "../../main/dictionary/kanjidicDb";
import {FORMAT_KEY, FORMAT_VERSION, tablePathFor, type DictionaryImport} from "../../main/dictionary/levelDictionary";
import {writeTable, type TableFields} from "./writeTable";

/** Measured: JMdict is 13.95 MB at 256 KB blocks and 14.45 MB at 128 KB. */
export const BLOCK_BYTES = 262144;

interface Dictionary {
  /** The JSON under language-assets; the table is beside it. */
  file: string;
  definition: DictionaryImport<any>;
  dataset: string;
  source: TableFields["source"];
}

// Names, links and licences: README.md's credits name each source; the links are the projects' own pages.
export const DICTIONARIES: Dictionary[] = [
  {
    file: "japanese/dict/jmdict.json",
    definition: jmdictImport,
    dataset: "japanese/jmdict",
    source: {name: "JMdict (EDRDG)", url: "https://www.edrdg.org/jmdict/j_jmdict.html", license: "EDRDG Licence (CC BY-SA)"}
  },
  {
    file: "japanese/dict/kanjidic.json",
    definition: kanjidicImport,
    dataset: "japanese/kanjidic",
    source: {name: "KANJIDIC2 (EDRDG)", url: "https://www.edrdg.org/wiki/index.php/KANJIDIC_Project", license: "EDRDG Licence (CC BY-SA)"}
  },
  {
    file: "mandarin/chinese/chinese.json",
    definition: chineseImport,
    dataset: "mandarin/cc-cedict",
    source: {name: "CC-CEDICT", url: "https://cc-cedict.org/wiki/", license: "CC BY-SA 4.0"}
  },
  {
    file: "cantonese/cantonese/cantodict.json",
    definition: chineseImport,
    dataset: "cantonese/cantodict",
    source: {name: "CantoDict", url: "https://cantonese.org/", license: "CC BY-SA"}
  }
];

export interface DictionaryResult {
  table: string;
  entries: number;
  blocks: number;
  rawBytes: number;
  packBytes: number;
}

/** The entries a dictionary's import would write into a store, plus the metadata and format marker; the last put of a key wins, as in a store. */
export const collectEntries = async <T>(definition: DictionaryImport<T>, raw: T): Promise<Map<string, string>> => {
  const entries = new Map<string, string>();
  await definition.writeEntries(raw, {
    put: async (key, value) => {
      entries.set(key, value);
    }
  });
  for (const [key, value] of Object.entries(definition.metadata(raw))) entries.set(key, value);
  entries.set(FORMAT_KEY, FORMAT_VERSION);
  return entries;
};

/**
 * Writes `<json without .json>.pack` from the dictionary file and checks it: every entry is read
 * back through the JS reader (a scan of the whole table, and `get` for a sample) and compared with
 * what the import defines, so a table that differs in one byte fails the build.
 */
export const buildDictionaryTable = async (
  jsonPath: string,
  definition: DictionaryImport<unknown>,
  fields: Omit<TableFields, "codec" | "version">
): Promise<DictionaryResult> => {
  const text = fs.readFileSync(jsonPath, "utf8");
  const raw = JSON.parse(text);
  const entries = await collectEntries(definition, raw);
  const metadata = definition.metadata(raw);
  const version = [metadata["raw/version"], metadata["raw/dictDate"]].filter(Boolean).join(" ");
  const table = tablePathFor(jsonPath);
  const written = writeTable(table, {...fields, version, codec: "text"}, [...entries].map(([key, value]) => [key, Buffer.from(value, "utf8")]), {blockBytes: BLOCK_BYTES});

  clearTableCaches();
  const expected = [...entries].sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  const rows = await scan(table);
  if (rows.length !== expected.length) throw new Error(`${table}: read back ${rows.length} entries, expected ${expected.length}`);
  for (const [i, [key, value]] of expected.entries()) {
    if (rows[i][0] !== key || rows[i][1].toString("utf8") !== value) throw new Error(`${table}: entry ${JSON.stringify(key)} differs after the round trip`);
  }
  for (let i = 0; i < expected.length; i += 97) {
    const found = await get(table, expected[i][0]);
    if (found?.toString("utf8") !== expected[i][1]) throw new Error(`${table}: get(${JSON.stringify(expected[i][0])}) differs`);
  }
  clearTableCaches();
  return {table: path.basename(table), entries: written.entries, blocks: written.blocks, rawBytes: Buffer.byteLength(text), packBytes: written.bytes};
};

/** Builds every dictionary whose JSON is staged under `<assets>`, and removes the JSON and its gzip. */
export const buildDictionaryTables = async (assets: string): Promise<DictionaryResult[]> => {
  const results: DictionaryResult[] = [];
  for (const {file, definition, dataset, source} of DICTIONARIES) {
    const jsonPath = path.join(assets, ...file.split("/"));
    // Already built (a repeat run for another architecture), or this language was not staged.
    if (!fs.existsSync(jsonPath)) continue;
    results.push(await buildDictionaryTable(jsonPath, definition, {dataset, source}));
    fs.rmSync(jsonPath, {force: true});
    fs.rmSync(`${jsonPath}.gz`, {force: true});
  }
  return results;
};

if (require.main === module) {
  const assets = process.argv[2];
  if (!assets) {
    console.error("usage: buildDictionaryTables.ts <language-assets directory>");
    process.exit(2);
  }
  const started = Date.now();
  buildDictionaryTables(path.resolve(assets)).then((results) => {
    for (const r of results) {
      console.error(`[buildDictionaryTables] ${r.table}: ${r.entries} entries, ${r.blocks} blocks, ${(r.packBytes / 1048576).toFixed(2)} MB (${((Date.now() - started) / 1000).toFixed(0)} s in)`);
    }
    console.log(JSON.stringify(results));
  }, (error) => {
    console.error(error);
    process.exit(1);
  });
}
