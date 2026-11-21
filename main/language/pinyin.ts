import {sys} from "#miteiru/reading-sys";
import {nativeReadingText} from "./nativeReadingText";

export interface PinyinItem {
  origin: string; pinyin: string; initial: string; final: string; first: string;
  finalHead: string; finalBody: string; finalTail: string; num: number;
  isZh: boolean; polyphonic: string[]; inZhRange: boolean; result: string;
}

type OriginalReading = Pick<PinyinItem, "origin" | "pinyin">;

export function fullPinyinBatch(texts: string[]): Promise<PinyinItem[][]>;
export function fullPinyinBatch(texts: string[], simplify: true): Promise<OriginalReading[][]>;
export async function fullPinyinBatch(texts: string[], simplify = false): Promise<OriginalReading[][]> {
  const safe = texts.map(nativeReadingText);
  const rows: Array<Array<PinyinItem | OriginalReading>> = await sys("pinyin_batch", {texts: safe, simplify});
  for (let i = 0; i < texts.length; i++) {
    if (safe[i] === texts[i]) continue;
    const chars = Array.from(texts[i]);
    for (const [j, item] of rows[i].entries()) {
      if (item.origin !== chars[j]) {
        item.origin = chars[j];
        if ("result" in item) item.first = item.result = chars[j];
      }
    }
  }
  return rows;
}

/** The projection Miteiru needs for each original Unicode character. */
export async function numberedPinyinBatch(texts: string[]): Promise<string[][]> {
  return (await fullPinyinBatch(texts)).map(row => row.map(item => item.pinyin));
}

export async function convertPinyinBatch(texts: string[], format: "numToSymbol" | "symbolToNum"): Promise<string[]> {
  if (!texts.length) return [];
  const safe = texts.map(nativeReadingText);
  const converted: string[] = await sys("convert_pinyin_batch", {texts: safe, toSymbols: format === "numToSymbol"});
  return converted.map((text, i) => {
    if (texts[i] === safe[i]) return text;
    const originals = texts[i].match(/[\uD800-\uDFFF\uFFFD]/gu)!;
    let index = 0;
    return text.replace(/\uFFFD/g, () => originals[index++]);
  });
}
