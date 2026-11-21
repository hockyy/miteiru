import {sys} from "#miteiru/reading-sys";

import {nativeReadingText} from "./nativeReadingText";

/** Jieba segments in one native request. Origins stay in JS, including lone UTF-16 surrogates. */
export async function jyutpingBatch(texts: string[]): Promise<[string, string | null][][]> {
  const rows: (string | null)[][] = await sys("jyutping_batch", {texts: texts.map(nativeReadingText)});
  return texts.map((text, line) => Array.from(text, (char, i) => [char, rows[line][i]]));
}
