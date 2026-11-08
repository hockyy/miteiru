import React from 'react';
import { videoConstants } from '../../../../../utils/constants';
import { ChineseEntry } from './ChineseEntry';
import { VietnameseEntry } from './VietnameseEntry';
import { WordSenseEntry } from './WordSenseEntry';
import { MEANING_ENTRY, MEANING_GLOSS } from '../../../meaningBoxTheme';
import type { MeaningContentState } from '../../types';
import {UserDictionaryEntryNotice} from '../UserDictionaryEntryNotice';

type MeaningContentProps = {
  meaningContent: MeaningContentState;
  lang: string;
  tags: Record<string, string>;
};

/** Routes word-level dictionary data to the correct language-specific entry list. */
export const MeaningContent = ({ meaningContent, lang, tags }: MeaningContentProps) => {
  if (meaningContent.notFound) {
    const term = meaningContent.single?.[0]?.text ?? meaningContent.content;
    return (
      <div className={MEANING_ENTRY}>
        <div className={MEANING_GLOSS}>No dictionary entry for {term}.</div>
      </div>
    );
  }

  if (meaningContent.sense?.length) {
    return <><UserDictionaryEntryNotice entry={meaningContent} lang={lang}/>{meaningContent.sense.map((sense, idx) => (
      <WordSenseEntry key={idx} sense={sense} index={idx} tags={tags} />
    ))}</>;
  }

  if (lang === videoConstants.cantoneseLang || lang === videoConstants.chineseLang) {
    return <><UserDictionaryEntryNotice entry={meaningContent} lang={lang}/><ChineseEntry meaningContent={meaningContent} /></>;
  }

  if (lang === videoConstants.vietnameseLang) {
    return <><UserDictionaryEntryNotice entry={meaningContent} lang={lang}/><VietnameseEntry meaningContent={meaningContent} /></>;
  }

  return null;
};
