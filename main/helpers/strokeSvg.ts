import path from "node:path";
import {readTextAsset} from "./assetFiles";
import {codecFor} from "./dataCodecs";
import {get, openTable} from "./dataTable";

// KanjiVG and Make Me a Hanzi files are named by code point, e.g. 05b57.svg or 23383.svg.
const STROKE_SVG_NAME = /^[0-9a-f]+\.svg$/i;

export const PACK_SUFFIX = ".pack";

/**
 * Reads a stroke-order SVG by file name; anything that is not a bare file name returns ''.
 * Packaged builds keep the SVGs of `<directory>` in the table `<directory>.pack` (docs/DATA_FORMAT.md),
 * whose codec rebuilds each file's text, and the table alone answers when it exists. Development has
 * the loose files instead.
 */
export const readStrokeSvg = async (directory: string, filename: unknown): Promise<string> => {
  if (typeof filename !== "string" || !STROKE_SVG_NAME.test(filename)) return "";
  const table = directory + PACK_SUFFIX;
  try {
    const value = await get(table, filename);
    return value ? codecFor((await openTable(table)).header.codec).decode(value) : "";
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") return "";
  }
  try {
    return await readTextAsset(path.join(directory, filename));
  } catch {
    return "";
  }
};
