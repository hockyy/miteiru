import { useEffect, useState } from 'react';
import { videoConstants } from '../../../../utils/constants';
import { buildRubyHtmlFromRomajiedData, getJapaneseHeadwordTokens } from '../../meaningEntries';
import type { MeaningContentState, RomajiedGroup } from '../types';

/**
 * Tokenizes the headword for ruby display in the header and for Shift+W copy.
 */
export const useMeaningRomajied = (
  meaning: string,
  lang: string,
  meaningContent: MeaningContentState,
  tokenizeMiteiru: (text: string) => Promise<unknown>,
) => {
  const [romajiedData, setRomajiedData] = useState<RomajiedGroup[]>([]);
  const [rubyHtmlContent, setRubyHtmlContent] = useState('');

  useEffect(() => {
    // Tokenizing is async; a slow result for the previous word must not replace this one's.
    let cancelled = false;
    const fetchRomajiedData = async () => {
      if (lang === videoConstants.japaneseLang) {
        const data = await Promise.all(
          meaningContent.single.map(async (entry, index) => ({
            key: entry.key ?? index,
            romajied: (await getJapaneseHeadwordTokens(entry, tokenizeMiteiru)) as RomajiedGroup['romajied'],
          })),
        );
        if (!cancelled) setRomajiedData(data);
        return;
      }

      if (
        lang === videoConstants.cantoneseLang ||
        lang === videoConstants.chineseLang ||
        lang === videoConstants.vietnameseLang
      ) {
        const sourceText =
          meaningContent.simplified?.includes(meaning)
            ? meaningContent.simplified
            : meaningContent.content;
        const romajied = (await tokenizeMiteiru(sourceText)) as RomajiedGroup['romajied'];
        if (!cancelled) setRomajiedData([{ key: 0, romajied }]);
      }
    };

    if (meaningContent.single.length) {
      fetchRomajiedData();
    } else {
      setRomajiedData([]);
    }
    return () => {
      cancelled = true;
    };
  }, [lang, meaning, meaningContent, tokenizeMiteiru]);

  useEffect(() => {
    setRubyHtmlContent(
      romajiedData.length ? buildRubyHtmlFromRomajiedData(romajiedData) : '',
    );
  }, [romajiedData]);

  return { romajiedData, rubyHtmlContent };
};
