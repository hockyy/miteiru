import React from 'react';
import { MEANING_SECTION, MEANING_SECTION_LABEL } from '../../meaningBoxTheme';

type DictionarySectionProps = {
  characterContent: React.ReactNode;
  meaningContent: React.ReactNode;
};

/** The word's senses, then its characters (kanji/hanzi breakdown), under one labelled section. */
export const DictionarySection = ({
  characterContent,
  meaningContent,
}: DictionarySectionProps) => {
  if (!characterContent && !meaningContent) {
    return null;
  }

  return (
    <section className={MEANING_SECTION}>
      <div className={MEANING_SECTION_LABEL}>Dictionary</div>
      <div className="space-y-3 p-4">
        {meaningContent}
        {characterContent}
      </div>
    </section>
  );
};
