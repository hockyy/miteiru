import { useEffect, useState } from 'react';
import { videoConstants } from '../../../../utils/constants';
import { buildRubyHtmlFromRomajiedData } from '../../meaningEntries';
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
    const fetchRomajiedData = async () => {
      if (lang === videoConstants.japaneseLang) {
        const data = await Promise.all(
          meaningContent.single.map(async (entry) => ({
            key: entry.key,
            romajied: (await tokenizeMiteiru(entry.text)) as RomajiedGroup['romajied'],
          })),
        );
        setRomajiedData(data);
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
        setRomajiedData([
          {
            key: 0,
            romajied: (await tokenizeMiteiru(sourceText)) as RomajiedGroup['romajied'],
          },
        ]);
      }
    };

    if (meaningContent.single.length) {
      fetchRomajiedData();
    } else {
      setRomajiedData([]);
    }
  }, [lang, meaning, meaningContent, tokenizeMiteiru]);

  useEffect(() => {
    setRubyHtmlContent(
      romajiedData.length ? buildRubyHtmlFromRomajiedData(romajiedData) : '',
    );
  }, [romajiedData]);

  return { romajiedData, rubyHtmlContent };
};
