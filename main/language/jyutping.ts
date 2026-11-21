import {sys} from "#miteiru/reading-sys";
import {nativeReadingText} from "./nativeReadingText";

/** Jieba segments in one native request. Origins stay in JS, including lone UTF-16 surrogates. */
export async function jyutpingBatch(texts: string[]): Promise<[string, string | null][][]> {
  // An ASCII newline cannot be a trie key. It keeps segment boundaries intact in one native string.
  const packed: string = await sys("jyutping_batch", {texts: [nativeReadingText(texts.join("\n"))]});
  const readings = packed.split("\n");
  let offset = 0;
  return texts.map(text => {
    const row: [string, string | null][] = [];
    for (const char of text) {
      row.push([char, readings[offset++] || null]);
    }
    offset++; // The separator between this segment and the next.
    return row;
  });
}
