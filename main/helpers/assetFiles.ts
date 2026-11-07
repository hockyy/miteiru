import fsPromises from "node:fs/promises";
import zlib from "node:zlib";
import {promisify} from "node:util";

const gunzip = promisify(zlib.gunzip);
const zstdDecompress = promisify(zlib.zstdDecompress);

/**
 * Packaged builds store the large language assets compressed next to where the plain file would be
 * (`zh.jieba.txt.zst`; see scripts/compressLanguageAssets.js and docs/DATA_FORMAT.md). Development
 * keeps them plain (or gzipped, as downloaded). These readers take the plain path and use whichever
 * exists: the plain file, else `.zst`, else `.gz`. The stroke-order SVGs and the dictionaries are
 * packed into tables instead.
 */
export const GZIP_SUFFIX = ".gz";
export const ZSTD_SUFFIX = ".zst";

const isMissing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === "ENOENT";

const pathExists = (filePath: string) => fsPromises.access(filePath).then(() => true, () => false);

export const assetExists = async (filePath: string) => (
  await pathExists(filePath) || await pathExists(filePath + ZSTD_SUFFIX) || await pathExists(filePath + GZIP_SUFFIX)
);

/** The file's bytes, or null when it does not exist. */
const readIfPresent = async (filePath: string) => {
  try {
    return await fsPromises.readFile(filePath);
  } catch (error) {
    if (!isMissing(error)) throw error;
    return null;
  }
};

/** The asset's bytes, from the plain file or, when only those exist, its zstd or gzipped copy. */
export const readAsset = async (filePath: string): Promise<Buffer> => {
  const plain = await readIfPresent(filePath);
  if (plain) return plain;
  const zstd = await readIfPresent(filePath + ZSTD_SUFFIX);
  if (zstd) return await zstdDecompress(zstd) as Buffer;
  // No copy at all: the error names the gzipped path, as before.
  return gunzip(await fsPromises.readFile(filePath + GZIP_SUFFIX));
};

export const readTextAsset = async (filePath: string): Promise<string> => (await readAsset(filePath)).toString("utf8");
