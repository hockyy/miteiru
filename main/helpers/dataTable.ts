import fsPromises from "node:fs/promises";
import zlib from "node:zlib";
import {promisify} from "node:util";

const zstdDecompress = promisify(zlib.zstdDecompress) as (data: Uint8Array) => Promise<Buffer>;

/**
 * MTRPACK2: a read-only table of (key, value) pairs sorted by the UTF-8 bytes of the key, in zstd
 * blocks. The byte layout, the header fields and the rules for changing them are in
 * docs/DATA_FORMAT.md. scripts/data/writeTable.ts writes tables; this module reads them, in Node
 * and in the app's worker (where zlib.zstdDecompress goes to the Rust command zstd_decompress).
 */
export const TABLE_MAGIC = "MTRPACK2";
export const TABLE_FORMAT = 2;
/** The magic, then the header length as a u32. */
export const PREAMBLE_BYTES = 12;
/** Decoded blocks kept per process, least recently used out first. */
export const BLOCK_CACHE_SIZE = 8;

/** [first key, offset in the data section, compressed length, number of entries] */
export type BlockRef = [string, number, number, number];

export interface TableHeader {
  format: number;
  dataset: string;
  version: string;
  codec: string;
  compression: "zstd";
  source: { name: string; url: string; license: string };
  entries: number;
  blocks: BlockRef[];
}

export interface ScanOptions {
  /** Keys at or above this. */
  gte?: string | Buffer;
  /** Keys below this. */
  lt?: string | Buffer;
  /** Keys that start with this. */
  prefix?: string | Buffer;
  limit?: number;
}

interface OpenTable {
  header: TableHeader;
  /** The blocks' first keys as bytes, for the binary search. */
  firstKeys: Buffer[];
  dataStart: number;
}

interface Block {
  keys: Buffer[];
  values: Buffer[];
}

const toBuffer = (key: string | Buffer) => (typeof key === "string" ? Buffer.from(key, "utf8") : key);

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const corrupt = (path: string, why: string) => new Error(`Data table ${path} is corrupt (${why})`);

const readExactly = async (handle: fsPromises.FileHandle, length: number, position: number, path: string): Promise<Buffer> => {
  const buffer = Buffer.alloc(length);
  let filled = 0;
  while (filled < length) {
    const {bytesRead} = await handle.read(buffer, filled, length - filled, position + filled);
    if (bytesRead === 0) throw corrupt(path, "truncated");
    filled += bytesRead;
  }
  return buffer;
};

const parseHeader = (value: unknown, path: string, dataLength: number): TableHeader => {
  const bad = (why: string) => corrupt(path, why);
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw bad("header is not an object");
  const header = value as Record<string, unknown>;
  if (header.format !== TABLE_FORMAT) throw bad(`unsupported format ${String(header.format)}`);
  for (const field of ["dataset", "version", "codec"]) {
    if (typeof header[field] !== "string") throw bad(`header has no ${field}`);
  }
  if (header.compression !== "zstd") throw bad(`unsupported compression ${String(header.compression)}`);
  if (!isCount(header.entries)) throw bad("bad entry count");
  if (!Array.isArray(header.blocks)) throw bad("header has no block list");
  let previous: Buffer | null = null;
  let entries = 0;
  for (const [number, block] of (header.blocks as unknown[]).entries()) {
    if (!Array.isArray(block) || block.length !== 4 || typeof block[0] !== "string" || !isCount(block[1]) || !isCount(block[2]) || !isCount(block[3]) || block[3] === 0) {
      throw bad(`bad block ${number}`);
    }
    if (block[1] + block[2] > dataLength) throw bad(`block ${number} is outside the file`);
    const first = Buffer.from(block[0], "utf8");
    if (previous && Buffer.compare(previous, first) >= 0) throw bad(`block ${number} is out of order`);
    previous = first;
    entries += block[3];
  }
  if (entries !== header.entries) throw bad("block entry counts do not add up");
  return header as unknown as TableHeader;
};

const load = async (path: string): Promise<OpenTable> => {
  const handle = await fsPromises.open(path, "r");
  try {
    const preamble = await readExactly(handle, PREAMBLE_BYTES, 0, path).catch(() => {
      throw new Error(`${path} is not a data table (too short)`);
    });
    if (preamble.toString("latin1", 0, TABLE_MAGIC.length) !== TABLE_MAGIC) throw new Error(`${path} is not a data table (bad magic)`);
    const headerLength = preamble.readUInt32LE(TABLE_MAGIC.length);
    const {size} = await fsPromises.stat(path);
    const dataStart = PREAMBLE_BYTES + headerLength;
    if (dataStart > size) throw corrupt(path, `header of ${headerLength} bytes does not fit`);
    let parsed: unknown;
    try {
      parsed = JSON.parse((await readExactly(handle, headerLength, PREAMBLE_BYTES, path)).toString("utf8"));
    } catch {
      throw corrupt(path, "unreadable header");
    }
    const header = parseHeader(parsed, path, size - dataStart);
    return {header, firstKeys: header.blocks.map(([first]) => Buffer.from(first, "utf8")), dataStart};
  } finally {
    await handle.close();
  }
};

const tables = new Map<string, Promise<OpenTable>>();

/** The table's parsed header and block index, loaded once per path. A failed open is not remembered. */
export const openTable = (path: string): Promise<OpenTable> => {
  let pending = tables.get(path);
  if (!pending) {
    pending = load(path);
    tables.set(path, pending);
    pending.catch(() => {
      if (tables.get(path) === pending) tables.delete(path);
    });
  }
  return pending;
};

/** The table's header, for callers that need the codec or the provenance. */
export const tableHeader = async (path: string): Promise<TableHeader> => (await openTable(path)).header;

/** Splits a decompressed block: repeated [u32 key length][key][u32 value length][value]. */
const decodeBlock = (raw: Buffer, expected: number, path: string): Block => {
  const keys: Buffer[] = [];
  const values: Buffer[] = [];
  let at = 0;
  const piece = () => {
    if (at + 4 > raw.length) throw corrupt(path, "block ends inside an entry");
    const length = raw.readUInt32LE(at);
    at += 4;
    if (at + length > raw.length) throw corrupt(path, "block ends inside an entry");
    const bytes = raw.subarray(at, at + length);
    at += length;
    return bytes;
  };
  while (at < raw.length) {
    keys.push(piece());
    values.push(piece());
  }
  if (keys.length !== expected) throw corrupt(path, `block holds ${keys.length} entries, not ${expected}`);
  for (let i = 1; i < keys.length; i++) {
    if (Buffer.compare(keys[i - 1], keys[i]) >= 0) throw corrupt(path, "keys in a block are out of order");
  }
  return {keys, values};
};

// Decoded blocks, most recently used last. The promise is cached, so concurrent readers of one
// block share one read.
const blocks = new Map<string, Promise<Block>>();

const readBlock = (path: string, table: OpenTable, index: number): Promise<Block> => {
  const id = `${path}\0${index}`;
  const cached = blocks.get(id);
  if (cached) {
    blocks.delete(id);
    blocks.set(id, cached);
    return cached;
  }
  const [, offset, length, count] = table.header.blocks[index];
  const pending = (async () => {
    const handle = await fsPromises.open(path, "r");
    let compressed: Buffer;
    try {
      compressed = await readExactly(handle, length, table.dataStart + offset, path);
    } finally {
      await handle.close();
    }
    let raw: Buffer;
    try {
      raw = await zstdDecompress(compressed);
    } catch (error) {
      throw corrupt(path, `block ${index} does not decompress: ${error instanceof Error ? error.message : String(error)}`);
    }
    return decodeBlock(raw, count, path);
  })();
  blocks.set(id, pending);
  pending.catch(() => {
    if (blocks.get(id) === pending) blocks.delete(id);
  });
  while (blocks.size > BLOCK_CACHE_SIZE) blocks.delete(blocks.keys().next().value as string);
  return pending;
};

/** The index of the last block whose first key is at or below `key`, or -1 when the key sorts before the table. */
const blockFor = (firstKeys: Buffer[], key: Buffer): number => {
  let low = 0;
  let high = firstKeys.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (Buffer.compare(firstKeys[middle], key) <= 0) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
};

/** The first entry at an index whose key is at or above `key`. */
const lowerBound = (keys: Buffer[], key: Buffer): number => {
  let low = 0;
  let high = keys.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (Buffer.compare(keys[middle], key) < 0) low = middle + 1;
    else high = middle;
  }
  return low;
};

/** The value stored under `key` (a copy), or null. Rejects with ENOENT when the file is missing. */
export const get = async (path: string, key: string | Buffer): Promise<Buffer | null> => {
  const table = await openTable(path);
  const wanted = toBuffer(key);
  const index = blockFor(table.firstKeys, wanted);
  if (index < 0) return null;
  const block = await readBlock(path, table, index);
  const at = lowerBound(block.keys, wanted);
  if (at >= block.keys.length || Buffer.compare(block.keys[at], wanted) !== 0) return null;
  return Buffer.from(block.values[at]);
};

/** The smallest key above every key that starts with `prefix`; null when there is none (all 0xff). */
const prefixEnd = (prefix: Buffer): Buffer | null => {
  let length = prefix.length;
  while (length > 0 && prefix[length - 1] === 0xff) length--;
  if (length === 0) return null;
  const end = Buffer.from(prefix.subarray(0, length));
  end[length - 1]++;
  return end;
};

/** Entries in key order within the bounds; keys come back as strings and values as copies. */
export const scan = async (path: string, options: ScanOptions = {}): Promise<Array<[string, Buffer]>> => {
  const table = await openTable(path);
  let lower: Buffer | null = options.gte === undefined ? null : toBuffer(options.gte);
  let upper: Buffer | null = options.lt === undefined ? null : toBuffer(options.lt);
  if (options.prefix !== undefined) {
    const prefix = toBuffer(options.prefix);
    if (!lower || Buffer.compare(lower, prefix) < 0) lower = prefix;
    const end = prefixEnd(prefix);
    if (end && (!upper || Buffer.compare(end, upper) < 0)) upper = end;
  }
  const limit = options.limit ?? Infinity;
  const result: Array<[string, Buffer]> = [];
  if (limit <= 0) return result;
  for (let index = Math.max(0, lower ? blockFor(table.firstKeys, lower) : 0); index < table.header.blocks.length; index++) {
    // The next block starts at or past the upper bound: nothing more to read.
    if (upper && Buffer.compare(table.firstKeys[index], upper) >= 0) break;
    const block = await readBlock(path, table, index);
    for (let at = lower ? lowerBound(block.keys, lower) : 0; at < block.keys.length; at++) {
      if (upper && Buffer.compare(block.keys[at], upper) >= 0) return result;
      result.push([block.keys[at].toString("utf8"), Buffer.from(block.values[at])]);
      if (result.length >= limit) return result;
    }
  }
  return result;
};

/** Forgets cached headers and blocks (tests that rewrite a file at the same path). */
export const clearTableCaches = () => {
  tables.clear();
  blocks.clear();
};
