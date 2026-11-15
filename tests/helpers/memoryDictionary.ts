import type {DictionaryDb, DictionaryImport} from "../../main/dictionary/levelDictionary";

/** Keys compared as the stores order them: by UTF-8 bytes. */
const byUtf8 = (a: string, b: string) => Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));

/**
 * A dictionary in memory, written by the real importer (`load.writeEntries`), so a test reads the same
 * keys the app's tables hold without a database on disk.
 */
export const memoryDictionary = async <T>(load: DictionaryImport<T>, raw: T): Promise<DictionaryDb> => {
  const entries = new Map<string, string>();
  await load.writeEntries(raw, {put: async (key, value) => {
    entries.set(key, value);
  }});
  for (const [key, value] of Object.entries(load.metadata(raw))) entries.set(key, value);
  const keys = [...entries.keys()].sort(byUtf8);
  return {
    get: async (key) => entries.get(key),
    getMany: async (wanted) => wanted.map((key) => entries.get(key)),
    values: ({gte, lt, limit = -1}) => ({
      all: async () => {
        const found: string[] = [];
        for (const key of keys) {
          if (gte !== undefined && byUtf8(key, gte) < 0) continue;
          if (lt !== undefined && byUtf8(key, lt) >= 0) break;
          found.push(entries.get(key)!);
          if (limit >= 0 && found.length >= limit) break;
        }
        return found;
      }
    }),
    close: async () => undefined
  };
};
