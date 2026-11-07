import fs from "node:fs";
import zlib from "node:zlib";
import {PREAMBLE_BYTES, TABLE_FORMAT, TABLE_MAGIC, type BlockRef, type TableHeader} from "../../main/helpers/dataTable";

/** The header fields the caller provides; the writer fills in format, compression, entries and blocks. */
export type TableFields = Pick<TableHeader, "dataset" | "version" | "codec" | "source">;

export interface WriteOptions {
  /** About how much raw data one block holds (default 128 KB). */
  blockBytes?: number;
  /** zstd level (default 19). */
  level?: number;
}

export const DEFAULT_BLOCK_BYTES = 128 * 1024;

const utf8Strict = new TextDecoder("utf-8", {fatal: true});

const u32 = (value: number) => {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
};

/** A block's raw form: repeated [u32 key length][key][u32 value length][value]. */
const encodeBlock = (entries: Array<[Buffer, Buffer]>): Buffer =>
  Buffer.concat(entries.flatMap(([key, value]) => [u32(key.length), key, u32(value.length), value]));

/**
 * Writes an MTRPACK2 table (docs/DATA_FORMAT.md): sorts the entries by the UTF-8 bytes of their keys
 * (not JS string order), rejects duplicate keys and keys that are not valid UTF-8, packs them into
 * blocks and compresses each block as one zstd frame.
 */
export const writeTable = (
  path: string,
  fields: TableFields,
  entries: Array<[string | Buffer, Buffer]>,
  options: WriteOptions = {}
): { entries: number; blocks: number; bytes: number } => {
  const blockBytes = options.blockBytes ?? DEFAULT_BLOCK_BYTES;
  const level = options.level ?? 19;
  const sorted = entries
    .map(([key, value]): [Buffer, Buffer] => [typeof key === "string" ? Buffer.from(key, "utf8") : key, value])
    .sort(([a], [b]) => Buffer.compare(a, b));
  sorted.forEach(([key], i) => {
    // The header keeps the first key of each block as JSON text, so every key must be text.
    try {
      utf8Strict.decode(key);
    } catch {
      throw new Error(`Table key ${key.toString("hex")} is not valid UTF-8`);
    }
    if (i > 0 && Buffer.compare(sorted[i - 1][0], key) === 0) throw new Error(`Duplicate table key ${JSON.stringify(key.toString("utf8"))}`);
  });

  const refs: BlockRef[] = [];
  const frames: Buffer[] = [];
  let offset = 0;
  let pending: Array<[Buffer, Buffer]> = [];
  let pendingBytes = 0;
  const flush = () => {
    if (pending.length === 0) return;
    const frame = zlib.zstdCompressSync(encodeBlock(pending), {params: {[zlib.constants.ZSTD_c_compressionLevel]: level}});
    refs.push([pending[0][0].toString("utf8"), offset, frame.length, pending.length]);
    frames.push(frame);
    offset += frame.length;
    pending = [];
    pendingBytes = 0;
  };
  for (const entry of sorted) {
    pending.push(entry);
    pendingBytes += 8 + entry[0].length + entry[1].length;
    if (pendingBytes >= blockBytes) flush();
  }
  flush();

  const header: TableHeader = {
    format: TABLE_FORMAT,
    dataset: fields.dataset,
    version: fields.version,
    codec: fields.codec,
    compression: "zstd",
    source: fields.source,
    entries: sorted.length,
    blocks: refs
  };
  const headerBytes = Buffer.from(JSON.stringify(header), "utf8");
  const preamble = Buffer.alloc(PREAMBLE_BYTES);
  preamble.write(TABLE_MAGIC, 0, "latin1");
  preamble.writeUInt32LE(headerBytes.length, TABLE_MAGIC.length);
  fs.writeFileSync(path, Buffer.concat([preamble, headerBytes, ...frames]));
  return {entries: sorted.length, blocks: refs.length, bytes: PREAMBLE_BYTES + headerBytes.length + offset};
};
