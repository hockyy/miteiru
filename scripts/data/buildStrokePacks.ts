/*
 * Builds the stroke-order tables of a staged app directory (scripts/compressLanguageAssets.js runs
 * this through tsx): han-character-core/kanji.pack and hanzi.pack, in MTRPACK2, and removes the
 * folders they replace. Prints one JSON line with the results.
 *
 *   npx tsx scripts/data/buildStrokePacks.ts <language-assets directory>
 */
import fs from "node:fs";
import path from "node:path";
import {codecFor, type Codec} from "../../main/helpers/dataCodecs";
import {writeTable, type TableFields} from "./writeTable";

/** Only these names can be asked for (main/helpers/strokeSvg.ts); KanjiVG's variants (04e14-Kaisho.svg) have no reader. */
export const READABLE_NAME = /^[0-9a-f]+\.svg$/i;

interface StrokeSet {
  /** The folder under han-character-core; the table is `<folder>.pack`. */
  folder: string;
  codec: string;
  fields: Omit<TableFields, "codec">;
}

// Sources and licences: the credits in README.md name KanjiVG; Make Me a Hanzi is credited here.
export const STROKE_SETS: StrokeSet[] = [
  {
    folder: "kanji",
    codec: "text",
    fields: {
      dataset: "han-character-core/kanji",
      version: "1.0.0",
      source: {name: "KanjiVG", url: "https://kanjivg.tagaini.net/", license: "CC BY-SA 3.0"}
    }
  },
  {
    folder: "hanzi",
    codec: "mmah-svg-1",
    fields: {
      dataset: "han-character-core/hanzi",
      version: "1.0.0",
      source: {name: "Make Me a Hanzi", url: "https://github.com/skishore/makemeahanzi", license: "Arphic Public License and LGPL"}
    }
  }
];

export interface PackResult {
  folder: string;
  files: number;
  rawBytes: number;
  packBytes: number;
  /** Files the codec could not rebuild exactly, stored as plain text. */
  fallbacks: number;
}

/**
 * Packs `<directory>` into `<directory>.pack` and removes the directory. Every value is decoded again
 * and compared with its source file, so a codec that loses a byte fails the build.
 */
export const packStrokeSet = (directory: string, codec: Codec, fields: Omit<TableFields, "codec">, isFallback: (value: Buffer) => boolean): PackResult => {
  const entries: Array<[string, Buffer]> = [];
  let rawBytes = 0;
  let fallbacks = 0;
  for (const name of fs.readdirSync(directory)) {
    const file = path.join(directory, name);
    if (!READABLE_NAME.test(name) || !fs.statSync(file).isFile()) continue;
    const text = fs.readFileSync(file, "utf8");
    const value = codec.encode(text);
    if (codec.decode(value) !== text) throw new Error(`${codec.id} does not round-trip ${file}`);
    if (isFallback(value)) fallbacks++;
    rawBytes += Buffer.byteLength(text);
    entries.push([name, value]);
  }
  const written = writeTable(directory + ".pack", {...fields, codec: codec.id}, entries);
  fs.rmSync(directory, {recursive: true, force: true});
  return {folder: path.basename(directory), files: written.entries, rawBytes, packBytes: written.bytes, fallbacks};
};

/** Packs every stroke set whose folder exists under `<assets>/han-character-core`. */
export const buildStrokePacks = (assets: string): PackResult[] => {
  const results: PackResult[] = [];
  for (const set of STROKE_SETS) {
    const directory = path.join(assets, "han-character-core", set.folder);
    if (!fs.existsSync(directory)) continue;
    const codec = codecFor(set.codec);
    // Only mmah-svg-1 has a fallback form: its values start with 0x00 when stored as plain text.
    results.push(packStrokeSet(directory, codec, set.fields, codec.id === "mmah-svg-1" ? (value) => value[0] === 0 : () => false));
  }
  return results;
};

if (require.main === module) {
  const assets = process.argv[2];
  if (!assets) {
    console.error("usage: buildStrokePacks.ts <language-assets directory>");
    process.exit(2);
  }
  console.log(JSON.stringify(buildStrokePacks(path.resolve(assets))));
}
