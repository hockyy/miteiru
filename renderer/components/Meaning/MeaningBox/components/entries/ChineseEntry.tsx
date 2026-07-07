import React from 'react';
import { joinString } from '../../../../../utils/utils';
import { InfoFieldsEntry } from './EntryLayout';
import type { MeaningContentState } from '../../types';

type ChineseEntryProps = {
  meaningContent: MeaningContentState;
};

export const ChineseEntry = ({ meaningContent }: ChineseEntryProps) => (
  <InfoFieldsEntry
    info={{
      Simplified: meaningContent.simplified,
      Jyutping: meaningContent.jyutping,
      $comments: meaningContent.comments,
    }}
    gloss={joinString(meaningContent.meaning as string | string[])}
  />
);
