import React from 'react';
import { videoConstants } from '../../../../../utils/constants';
import { ChineseEntry } from './ChineseEntry';
import { VietnameseEntry } from './VietnameseEntry';
import { WordSenseEntry } from './WordSenseEntry';
import type { MeaningContentState } from '../../types';

type MeaningContentProps = {
  meaningContent: MeaningContentState;
  lang: string;
  tags: Record<string, string>;
};

/** Routes word-level dictionary data to the correct language-specific entry list. */
export const MeaningContent = ({ meaningContent, lang, tags }: MeaningContentProps) => {
  if (meaningContent.sense?.length) {
    return meaningContent.sense.map((sense, idx) => (
      <WordSenseEntry key={idx} sense={sense} index={idx} tags={tags} />
    ));
  }

  if (lang === videoConstants.cantoneseLang || lang === videoConstants.chineseLang) {
    return <ChineseEntry meaningContent={meaningContent} />;
  }

  if (lang === videoConstants.vietnameseLang) {
    return <VietnameseEntry meaningContent={meaningContent} />;
  }

  return null;
};
