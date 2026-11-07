import fsPromises from "node:fs/promises";
import zlib from "node:zlib";
import {promisify} from "node:util";

const gunzip = promisify(zlib.gunzip);

/**
 * Asset pack, format v1. A pack holds many small files (the stroke-order SVGs: 21,000 files that
 * made the installer slow to unpack) in one file, and a reader fetches a single entry by offset.
 * scripts/assetPack.js writes it; readPackEntry below reads it.
 *
 *   bytes 0-7         ASCII `MTRPACK1`
 *   bytes 8-11        u32 little-endian N, the index length in bytes
 *   bytes 12 to 12+N  UTF-8 JSON {"<file name>": [offset, length], ...}; keys are the plain file
 *                     names (`065e5.svg`), sorted; offsets count from the start of the data section
 *   from byte 12+N    the data section: each entry is one gzip stream of its file
 */
export const PACK_SUFFIX = ".pack";

const MAGIC = "MTRPACK1";
const HEADER_BYTES = 12;

type PackIndex = Map<string, [number, number]>;

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const readExactly = async (handle: fsPromises.FileHandle, length: number, position: number, packPath: string): Promise<Buffer> => {
  const buffer = Buffer.alloc(length);
  let filled = 0;
  while (filled < length) {
    const {bytesRead} = await handle.read(buffer, filled, length - filled, position + filled);
    if (bytesRead === 0) throw new Error(`Asset pack ${packPath} is truncated`);
    filled += bytesRead;
  }
  return buffer;
};

const loadIndex = async (packPath: string): Promise<{ index: PackIndex; dataStart: number }> => {
  const handle = await fsPromises.open(packPath, "r");
  try {
    const header = await readExactly(handle, HEADER_BYTES, 0, packPath).catch(() => {
      throw new Error(`${packPath} is not an asset pack (too short)`);
    });
    if (header.toString("latin1", 0, MAGIC.length) !== MAGIC) throw new Error(`${packPath} is not an asset pack (bad magic)`);
    const indexLength = header.readUInt32LE(MAGIC.length);
    const {size} = await fsPromises.stat(packPath);
    const dataStart = HEADER_BYTES + indexLength;
    if (dataStart > size) throw new Error(`Asset pack ${packPath} is corrupt (index of ${indexLength} bytes does not fit)`);
    let parsed: unknown;
    try {
      parsed = JSON.parse((await readExactly(handle, indexLength, HEADER_BYTES, packPath)).toString("utf8"));
    } catch {
      throw new Error(`Asset pack ${packPath} is corrupt (unreadable index)`);
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error(`Asset pack ${packPath} is corrupt (index is not an object)`);
    const dataLength = size - dataStart;
    const index: PackIndex = new Map();
    for (const [name, entry] of Object.entries(parsed)) {
      if (!Array.isArray(entry) || entry.length !== 2 || !isCount(entry[0]) || !isCount(entry[1]) || entry[0] + entry[1] > dataLength) {
        throw new Error(`Asset pack ${packPath} is corrupt (bad entry for ${name})`);
      }
      index.set(name, [entry[0], entry[1]]);
    }
    return {index, dataStart};
  } finally {
    await handle.close();
  }
};

const indexes = new Map<string, ReturnType<typeof loadIndex>>();

const indexOf = (packPath: string) => {
  let pending = indexes.get(packPath);
  if (!pending) {
    pending = loadIndex(packPath);
    indexes.set(packPath, pending);
    // A failed load is not remembered, so a later call tries again.
    pending.catch(() => {
      if (indexes.get(packPath) === pending) indexes.delete(packPath);
    });
  }
  return pending;
};

/**
 * The named file's bytes from a pack, or null when the pack has no such entry. Rejects with the
 * `open` error (ENOENT) when the pack itself is missing, and with a clear message when it is corrupt.
 */
export const readPackEntry = async (packPath: string, name: string): Promise<Buffer | null> => {
  const {index, dataStart} = await indexOf(packPath);
  const entry = index.get(name);
  if (!entry) return null;
  const [offset, length] = entry;
  const handle = await fsPromises.open(packPath, "r");
  try {
    return await gunzip(await readExactly(handle, length, dataStart + offset, packPath));
  } finally {
    await handle.close();
  }
};
