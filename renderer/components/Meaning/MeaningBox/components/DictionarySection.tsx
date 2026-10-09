import React from 'react';
import { MEANING_SECTION, MEANING_SECTION_LABEL } from '../../meaningBoxTheme';

type DictionarySectionProps = {
  characterContent: React.ReactNode;
  meaningContent: React.ReactNode;
};

/**
 * Character details and word senses under one labelled section. Character details exist only when a
 * single kanji/hanzi was looked up (often clicked to drill into a word), so they come first.
 */
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
        {characterContent}
        {meaningContent}
      </div>
    </section>
  );
};
