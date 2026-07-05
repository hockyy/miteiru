/**
 * Ruby HTML for a full sentence via the desktop tokenizer.
 * Used by hooks/useSentenceAnki.ts and MeaningBox copy/export flows.
 */
import { buildRubyHtmlFromRomajiedData } from '../components/Meaning/meaningEntries';

export async function getSentenceRubyData(
  sentence: string,
  tokenizeMiteiru: (text: string) => Promise<unknown[]>,
) {
  const romajied = await tokenizeMiteiru(sentence);
  const romajiedData = [{ key: 0, romajied }];

  return {
    rubyHtml: buildRubyHtmlFromRomajiedData(romajiedData),
    romajiedData,
  };
}
