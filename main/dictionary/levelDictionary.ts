import {promises as fs} from "node:fs";
import {Level} from "level";

/**
 * Shared LevelDB plumbing for the bundled dictionaries (JMdict, KANJIDIC, CC-CEDICT, CantoDict).
 * Replaces jmdict-wrapper, kanjidic-wrapper and cc-chinese-wrapper (all Unlicense) and keeps
 * their key layout. Databases without FORMAT_KEY (including every one those packages built)
 * are rebuilt once from the bundled JSON, which drops their stale and broken index keys.
 */
export type DictionaryDb = Level<string, string>;

type DictionaryImport<T> = {
  /** Metadata keys whose presence marks a finished import; written after every entry. */
  metadataKeys: string[];
  writeEntries: (raw: T, writer: BatchWriter) => Promise<void>;
  metadata: (raw: T) => Record<string, string>;
};

const MAX_BATCH_SIZE = 10000;
const FORMAT_KEY = "raw/miteiruDictionaryFormat";
const FORMAT_VERSION = "1";

export class BatchWriter {
  private operations: { type: "put"; key: string; value: string }[] = [];

  constructor(private readonly db: DictionaryDb) {}

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
    contents = await fs.readFile(importPath, "utf8");
  } catch (error) {
    throw new Error(`Dictionary file not found: ${importPath} (${error.message})`);
  }
  return JSON.parse(contents) as T;
};

/**
 * Opens the dictionary database at `dbPath`, (re)building it from `importPath` (a JSON file)
 * when it is missing, from an older format, or was interrupted mid-import. Metadata and the
 * format marker are written last, so an interrupted import is redone on the next open.
 */
export const openDictionary = async <T>(
  dbPath: string,
  importPath: string,
  dictionaryImport: DictionaryImport<T>
): Promise<{ db: DictionaryDb; metadata: Record<string, string> }> => {
  const {metadataKeys} = dictionaryImport;
  let db: DictionaryDb = new Level<string, string>(dbPath);
  try {
    const stored = await db.getMany([...metadataKeys, FORMAT_KEY]);
    const storedMetadata = Object.fromEntries(metadataKeys.map((key, index) => [key, stored[index]]));
    const hasMetadata = metadataKeys.every((key) => storedMetadata[key] !== undefined);
    if (hasMetadata && stored[metadataKeys.length] === FORMAT_VERSION) {
      return {db, metadata: storedMetadata};
    }

    let raw: T;
    try {
      if (!importPath) throw new Error(`Dictionary database ${dbPath} is not imported and no import file was given`);
      raw = await readImportFile<T>(importPath);
    } catch (error) {
      // An older but complete database still works when there is nothing to rebuild it from.
      if (hasMetadata) return {db, metadata: storedMetadata};
      throw error;
    }

    // Start from an empty directory so keys from an older format or a partial import go away.
    await db.close();
    await fs.rm(dbPath, {recursive: true, force: true});
    db = new Level<string, string>(dbPath);

    const writer = new BatchWriter(db);
    await dictionaryImport.writeEntries(raw, writer);
    await writer.flush();
    const metadata = dictionaryImport.metadata(raw);
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

/**
 * Values of the keys that start with `prefix`, in key order (`limit` < 0 means all).
 * Keys under `excludedPrefix` are skipped without scanning them.
 */
export const valuesWithPrefix = async (
  db: DictionaryDb,
  prefix: string,
  limit = -1,
  excludedPrefix?: string
): Promise<string[]> => {
  const end = prefixEnd(prefix);
  if (!excludedPrefix || !excludedPrefix.startsWith(prefix)) {
    if (excludedPrefix && prefix.startsWith(excludedPrefix)) return [];
    return db.values({gte: prefix, lt: end, limit}).all();
  }

  const before = await db.values({gte: prefix, lt: excludedPrefix, limit}).all();
  if (limit >= 0 && before.length >= limit) return before;
  const after = await db.values({
    gte: prefixEnd(excludedPrefix),
    lt: end,
    limit: limit < 0 ? -1 : limit - before.length
  }).all();
  return [...before, ...after];
};

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
