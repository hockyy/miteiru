import fs from "node:fs";
import fsPromises from "node:fs/promises";
import zlib from "node:zlib";
import {promisify} from "node:util";

const gunzip = promisify(zlib.gunzip);

/**
 * Packaged builds store the large language assets gzipped next to where the plain file would be
 * (`jmdict.json.gz`, `05b57.svg.gz`; see scripts/compressLanguageAssets.js). Development keeps them
 * plain. These readers take the plain path and use whichever exists.
 */
export const GZIP_SUFFIX = ".gz";

const isMissing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === "ENOENT";

export const assetExists = (filePath: string) => fs.existsSync(filePath) || fs.existsSync(filePath + GZIP_SUFFIX);

/** The asset's bytes, from the plain file or, when only that exists, its gzipped copy. */
export const readAsset = async (filePath: string): Promise<Buffer> => {
  try {
    return await fsPromises.readFile(filePath);
  } catch (error) {
    if (!isMissing(error)) throw error;
    return gunzip(await fsPromises.readFile(filePath + GZIP_SUFFIX));
  }
};

export const readAssetSync = (filePath: string): Buffer => {
  try {
    return fs.readFileSync(filePath);
  } catch (error) {
    if (!isMissing(error)) throw error;
    return zlib.gunzipSync(fs.readFileSync(filePath + GZIP_SUFFIX));
  }
};

export const readTextAsset = async (filePath: string): Promise<string> => (await readAsset(filePath)).toString("utf8");
