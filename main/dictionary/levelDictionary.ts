import {assetExists, readTextAsset} from "../helpers/assetFiles";
import {get as getTableValue, openTable, scan as scanTable} from "../helpers/dataTable";
import {promises as fs} from "node:fs";
import * as levelModule from "level";
import {Level} from "level";

/**
 * Shared plumbing for the bundled dictionaries (JMdict, KANJIDIC, CC-CEDICT, CantoDict). Replaces
 * jmdict-wrapper, kanjidic-wrapper and cc-chinese-wrapper (all Unlicense) and keeps their key layout.
 *
 * Packaged builds ship each dictionary as a data table (`jmdict.pack` where `jmdict.json` would be;
 * docs/DATA_FORMAT.md) holding exactly the keys the import below writes, and read it directly: no
 * import, no copy, no first-load wait. Development and the tests have the JSON and import it into a
 * `level` store once; databases without FORMAT_KEY (including every one those wrapper packages
 * built) are rebuilt from the JSON, which drops their stale and broken index keys.
 */

/** What the dictionary queries use: a `Level<string, string>` and a table store both satisfy it. */
export interface DictionaryDb {
  get(key: string): Promise<string | undefined>;
  getMany(keys: string[]): Promise<(string | undefined)[]>;
  /** `limit` < 0 means all. */
  values(options: { gte?: string; lt?: string; limit?: number }): { all(): Promise<string[]> };
  close(): Promise<void>;
}

/** What `writeEntries` uses of a writer: the import writes through BatchWriter, the table build collects. */
export interface EntryWriter {
  put(key: string, value: string): Promise<void>;
}

export type DictionaryImport<T> = {
  /** Metadata keys whose presence marks a finished import; written after every entry. */
  metadataKeys: string[];
  writeEntries: (raw: T, writer: EntryWriter) => Promise<void>;
  metadata: (raw: T) => Record<string, string>;
  /**
   * Development builds only: their store imports this file itself (src-tauri/src/sys/dict_import.rs),
   * writing the same keys without parsing and sending 100 MB through the page. Packaged builds read
   * tables and never import. writeEntries stays for plain `level` (the tests) and for the table build
   * (scripts/data/buildDictionaryTables.ts). `metadata` then gets the file's version (and dictDate,
   * if it has one) only.
   */
  nativeLayout?: "jmdict" | "kanjidic" | "chinese";
};

/** The desktop store (renderer/platform/backend/shims/level.ts); plain `level` has neither. */
type DesktopStore = Level<string, string> & {
  bulkLoad?: (on: boolean) => Promise<void>;
  importDictionary?: (path: string, layout: string) => Promise<Record<string, string>>;
};

const MAX_BATCH_SIZE = 10000;
export const FORMAT_KEY = "raw/miteiruDictionaryFormat";
export const FORMAT_VERSION = "1";
export const TABLE_SUFFIX = ".pack";

export class BatchWriter implements EntryWriter {
  private operations: { type: "put"; key: string; value: string }[] = [];

  constructor(private readonly db: Level<string, string>) {}

  async put(key: string, value: string) {
    this.operations.push({type: "put", key, value});
    if (this.operations.length >= MAX_BATCH_SIZE) await this.flush();
  }

  async flush() {
    if (this.operations.length === 0) return;
    const operations = this.operations;
    this.operations = [];
    await this.db.batch(operations);
  }
}

const readImportFile = async <T>(importPath: string): Promise<T> => {
  let contents: string;
  try {
    contents = await readTextAsset(importPath);
  } catch (error) {
    throw new Error(`Dictionary file not found: ${importPath} (${error.message})`);
  }
  return JSON.parse(contents) as T;
};

/** The table that stands in for a dictionary's JSON file: `jmdict.json` becomes `jmdict.pack`. */
export const tablePathFor = (importPath: string) => importPath.replace(/\.json$/i, "") + TABLE_SUFFIX;

const exists = (target: string) => fs.access(target).then(() => true, () => false);

/** Removes `dbPath` and the SQLite files the desktop store keeps beside it (`<dbPath>.sqlite3`, `-wal`, `-shm`). */
export const removeDictionaryStore = async (dbPath: string) => {
  await Promise.all([dbPath, `${dbPath}.sqlite3`, `${dbPath}.sqlite3-wal`, `${dbPath}.sqlite3-shm`]
    .map((target) => fs.rm(target, {recursive: true, force: true})));
};

/**
 * Deletes what 7.x and the first 8.x builds cached for a dictionary that now reads from a table:
 * the LevelDB folder at `dbPath` (it has a CURRENT file) and the SQLite database beside it. Only
 * ever called with a dictionary's own store path; learning data lives in the same folder.
 */
const removeLegacyCaches = async (dbPath: string) => {
  try {
    if (await exists(`${dbPath}/CURRENT`)) await fs.rm(dbPath, {recursive: true, force: true});
    await Promise.all([`${dbPath}.sqlite3`, `${dbPath}.sqlite3-wal`, `${dbPath}.sqlite3-shm`]
      .map((target) => fs.rm(target, {force: true})));
  } catch (error) {
    // Reading does not need the space back; a locked file is tried again on the next load.
    console.warn(`Could not remove the old dictionary cache of ${dbPath}:`, error);
  }
};

/** A table through the desktop shim (one IPC call per query) when it has one, else through the JS reader (Node). */
const openTableStore = async (tablePath: string): Promise<DictionaryDb> => {
  const desktop = (levelModule as { openReadOnlyTable?: (path: string) => Promise<DictionaryDb> }).openReadOnlyTable;
  if (desktop) return desktop(tablePath);
  await openTable(tablePath);
  const text = (value: Buffer | null) => (value === null ? undefined : value.toString("utf8"));
  return {
    get: async (key) => text(await getTableValue(tablePath, key)),
    getMany: async (keys) => {
      const values: (string | undefined)[] = [];
      for (const key of keys) values.push(text(await getTableValue(tablePath, key)));
      return values;
    },
    // scan() returns nothing for a limit of 0 or less; here -1 means all, as in `level`.
    values: ({gte, lt, limit = -1}) => ({
      all: async () => limit === 0
        ? []
        : (await scanTable(tablePath, {gte, lt, limit: limit < 0 ? undefined : limit})).map(([, value]) => value.toString("utf8"))
    }),
    close: async () => undefined
  };
};

const openFromTable = async <T>(
  tablePath: string,
  dbPath: string,
  {metadataKeys}: DictionaryImport<T>
): Promise<{ db: DictionaryDb; metadata: Record<string, string> }> => {
  const db = await openTableStore(tablePath);
  try {
    const stored = await db.getMany([...metadataKeys, FORMAT_KEY]);
    const metadata = Object.fromEntries(metadataKeys.map((key, index) => [key, stored[index]]));
    // A table without its marker was cut short or built by something else: say so, do not guess.
    if (metadataKeys.some((key) => metadata[key] === undefined) || stored[metadataKeys.length] !== FORMAT_VERSION) {
      throw new Error(`Dictionary table ${tablePath} is broken: it has no complete format marker`);
    }
    await removeLegacyCaches(dbPath);
    return {db, metadata};
  } catch (error) {
    await db.close();
    throw error;
  }
};

/**
 * Opens a dictionary. The table beside `importPath` (`.json` replaced by `.pack`) is read directly
 * when it exists. Otherwise the database at `dbPath` is (re)built from `importPath` (a JSON file)
 * when it is missing, from an older format, or was interrupted mid-import. Metadata and the format
 * marker are written last, so an interrupted import is redone on the next open.
 */
export const openDictionary = async <T>(
  dbPath: string,
  importPath: string,
  dictionaryImport: DictionaryImport<T>
): Promise<{ db: DictionaryDb; metadata: Record<string, string> }> => {
  const table = importPath ? tablePathFor(importPath) : "";
  if (table && await exists(table)) return openFromTable(table, dbPath, dictionaryImport);
  return importDictionary(dbPath, importPath, dictionaryImport);
};

const importDictionary = async <T>(
  dbPath: string,
  importPath: string,
  dictionaryImport: DictionaryImport<T>
): Promise<{ db: Level<string, string>; metadata: Record<string, string> }> => {
  const {metadataKeys} = dictionaryImport;
  // Only the desktop store has importDictionary. A LevelDB folder at its path is a 7.x cache, which
  // the first open would migrate into SQLite (kv_open): millions of rows the rebuild then discards.
  if ((Level.prototype as DesktopStore).importDictionary && await exists(`${dbPath}/CURRENT`)) {
    await fs.rm(dbPath, {recursive: true, force: true});
  }
  let db = new Level<string, string>(dbPath);
  try {
    const stored = await db.getMany([...metadataKeys, FORMAT_KEY]);
    const storedMetadata = Object.fromEntries(metadataKeys.map((key, index) => [key, stored[index]]));
    const hasMetadata = metadataKeys.every((key) => storedMetadata[key] !== undefined);
    if (hasMetadata && stored[metadataKeys.length] === FORMAT_VERSION) {
      return {db, metadata: storedMetadata};
    }

    const native = dictionaryImport.nativeLayout && (db as DesktopStore).importDictionary ? dictionaryImport.nativeLayout : null;
    let raw: T | null = null;
    try {
      if (!importPath) throw new Error(`Dictionary database ${dbPath} is not imported and no import file was given`);
      if (!native) raw = await readImportFile<T>(importPath);
      else if (!await assetExists(importPath)) throw new Error(`Dictionary file not found: ${importPath}`);
    } catch (error) {
      // An older but complete database still works when there is nothing to rebuild it from.
      if (hasMetadata) return {db, metadata: storedMetadata};
      throw error;
    }

    // Start from an empty store so keys from an older format or a partial import go away: the
    // folder, and the SQLite database the desktop store keeps beside it (which holds 7.x's keys).
    await db.close();
    await removeDictionaryStore(dbPath);
    db = new Level<string, string>(dbPath);

    const store = db as DesktopStore;
    let metadata: Record<string, string>;
    if (native) {
      metadata = dictionaryImport.metadata(await store.importDictionary(importPath, native) as T);
    } else {
      // The desktop store has a bulk mode for exactly this; plain `level` (tests) does not.
      await store.bulkLoad?.(true);
      try {
        const writer = new BatchWriter(db);
        await dictionaryImport.writeEntries(raw, writer);
        await writer.flush();
        metadata = dictionaryImport.metadata(raw);
      } finally {
        await store.bulkLoad?.(false);
      }
    }
    // Written last, after bulk mode has checkpointed everything, so it marks a complete import.
    await db.batch([...Object.entries(metadata), [FORMAT_KEY, FORMAT_VERSION]]
      .map(([key, value]) => ({type: "put" as const, key, value})));
    return {db, metadata};
  } catch (error) {
    await db.close();
    throw error;
  }
};

// Sorts after every character in UTF-8, so [prefix, prefixEnd(prefix)) holds every key starting with prefix.
const prefixEnd = (prefix: string) => `${prefix}\u{10FFFF}`;

/** Values of the keys that start with `prefix`, in key order (`limit` < 0 means all). */
export const valuesWithPrefix = (db: DictionaryDb, prefix: string, limit = -1): Promise<string[]> =>
  db.values({gte: prefix, lt: prefixEnd(prefix), limit}).all();

/** JSON records stored under `keys`, in order; keys with no record are skipped. */
export const getJsonRecords = async <T>(db: DictionaryDb, keys: string[]): Promise<T[]> => {
  if (keys.length === 0) return [];
  const values = await db.getMany(keys);
  return values.filter((value): value is string => value !== undefined).map((value) => JSON.parse(value) as T);
};

export const getJsonRecord = async <T>(db: DictionaryDb, key: string): Promise<T | undefined> => {
  const value = await db.get(key);
  return value === undefined ? undefined : JSON.parse(value) as T;
};

/** Every distinct substring of `text`, split by code point so astral hanzi stay whole. */
export const allSubstrings = (text: string): Set<string> => {
  const chars = Array.from(text);
  const substrings = new Set<string>();
  for (let start = 0; start < chars.length; start++) {
    for (let end = start + 1; end <= chars.length; end++) {
      substrings.add(chars.slice(start, end).join(""));
    }
  }
  return substrings;
};
