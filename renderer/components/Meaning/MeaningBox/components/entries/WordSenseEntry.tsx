import React from 'react';
import { joinString } from '../../../../../utils/utils';
import { TagPill, WordEntryCard } from './EntryLayout';
import type { SenseEntry } from '../../types';

type WordSenseEntryProps = {
  sense: SenseEntry;
  index: number;
  tags: Record<string, string>;
};

/** One JMdict / JMDict sense row (part-of-speech tags + English gloss). */
export const WordSenseEntry = ({ sense, index, tags }: WordSenseEntryProps) => (
  <WordEntryCard
    glossIndex={index + 1}
    gloss={joinString(sense.gloss.map((gloss) => gloss.text))}
  >
    {sense.partOfSpeech.map((pos, key) => {
      let label = pos;
      try {
        label = tags[pos] ?? pos;
      } catch {
        // keep raw POS tag
      }
      return <TagPill key={key}>{label}</TagPill>;
    })}
  </WordEntryCard>
);
