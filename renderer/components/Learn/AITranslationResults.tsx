/** Renders translation cards or loading/error states. Parent: AITranslationPanel.tsx */
import React from 'react';
import {AITranslationResult} from '../../types/aiTranslation';
import {TranslationSentenceCard} from './TranslationSentenceCard';
import {LearnErrorMessage} from './LearnErrorMessage';
import {CuteLoadingAnimation} from './CuteLoadingAnimation';

interface AITranslationResultsProps {
  result: AITranslationResult | null;
  isLoading?: boolean;
  errorMessage?: string;
  pronunciationLabel: string;
  onMoveToAnalyzer: (text: string) => void;
}

export const AITranslationResults: React.FC<AITranslationResultsProps> = ({
  result,
  isLoading = false,
  errorMessage,
  pronunciationLabel,
  onMoveToAnalyzer,
}) => {
  if (errorMessage) {
    return <LearnErrorMessage message={errorMessage} />;
  }

  if (isLoading && !result) {
    return (
      <CuteLoadingAnimation
        message="Translating your sentences..."
        subMessage="Translations, grammar notes, and glossary on the way"
      />
    );
  }

  // Hook finished but parser found no valid sentences
  if (!result || result.sentences.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {result.sentences.map((sentence, index) => (
        <TranslationSentenceCard
          key={`${sentence.source}-${index}`}
          sentence={sentence}
          index={index}
          pronunciationLabel={pronunciationLabel}
          onMoveToAnalyzer={onMoveToAnalyzer}
        />
      ))}
    </div>
  );
};
