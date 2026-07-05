/** One translated sentence with formal/neutral/casual rows and detail sections. */
import React, {useMemo} from 'react';
import {SentenceTranslation} from '../../types/aiTranslation';
import {
  TranslationChunkNotesSection,
  TranslationGlossarySection,
  TranslationGrammarSection,
} from './TranslationDetailSections';
import {TranslationVariantRow} from './TranslationVariantRow';

interface TranslationSentenceCardProps {
  sentence: SentenceTranslation;
  index: number;
  pronunciationLabel: string;
  onMoveToAnalyzer: (text: string) => void;
}

export const TranslationSentenceCard: React.FC<TranslationSentenceCardProps> = ({
  sentence,
  index,
  pronunciationLabel,
  onMoveToAnalyzer,
}) => {
  const hasDetails = useMemo(
    () =>
      sentence.grammar.length > 0 ||
      sentence.glossary.length > 0 ||
      sentence.chunks.length > 0,
    [sentence.chunks.length, sentence.glossary.length, sentence.grammar.length],
  );

  return (
    <article className="rounded-lg border-2 border-purple-300 bg-purple-50/40 overflow-hidden">
      <div className="px-3 py-2 bg-purple-100 border-b border-purple-200">
        <h4 className="text-sm font-bold text-purple-900">Sentence {index + 1}</h4>
        {sentence.source && (
          <p className="text-xs text-purple-700 mt-1 italic">&ldquo;{sentence.source}&rdquo;</p>
        )}
      </div>

      <div className="p-3 space-y-2">
        <TranslationVariantRow
          label="Formal"
          variant={sentence.formal}
          pronunciationLabel={pronunciationLabel}
          onMoveToAnalyzer={onMoveToAnalyzer}
        />
        <TranslationVariantRow
          label="Neutral"
          variant={sentence.neutral}
          pronunciationLabel={pronunciationLabel}
          onMoveToAnalyzer={onMoveToAnalyzer}
        />
        <TranslationVariantRow
          label="Casual"
          variant={sentence.casual}
          pronunciationLabel={pronunciationLabel}
          onMoveToAnalyzer={onMoveToAnalyzer}
        />
      </div>

      {hasDetails && (
        <div className="px-3 pb-3 pt-1 space-y-4 border-t border-purple-200 bg-purple-50/30">
          <TranslationGrammarSection items={sentence.grammar} />
          <TranslationGlossarySection items={sentence.glossary} />
          <TranslationChunkNotesSection items={sentence.chunks} />
        </div>
      )}
    </article>
  );
};
