import React from 'react';
import { InfoFieldsEntry } from './EntryLayout';
import type { MeaningContentState } from '../../types';

type VietnameseEntryProps = {
  meaningContent: MeaningContentState;
};

export const VietnameseEntry = ({ meaningContent }: VietnameseEntryProps) => (
  <InfoFieldsEntry
    info={{ Content: meaningContent.content }}
    gloss={meaningContent.meaning}
  />
);
