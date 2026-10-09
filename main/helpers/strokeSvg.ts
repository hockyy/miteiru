import path from "node:path";
import {readTextAsset} from "./assetFiles";

// KanjiVG and Make Me a Hanzi files are named by code point, e.g. 05b57.svg or 23383.svg.
const STROKE_SVG_NAME = /^[0-9a-f]+\.svg$/i;

/** Reads a stroke-order SVG by file name; anything that is not a bare file name returns ''. */
export const readStrokeSvg = async (directory: string, filename: unknown): Promise<string> => {
  if (typeof filename !== "string" || !STROKE_SVG_NAME.test(filename)) return "";
  try {
    return await readTextAsset(path.join(directory, filename));
  } catch {
    return "";
  }
};
