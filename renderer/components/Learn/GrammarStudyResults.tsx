/** Grammar study results shell — loading, error, and card display. */
import React from 'react';
import { GrammarStudyEntry } from '../../types/jpGrammar';
import { LearnErrorMessage } from './LearnErrorMessage';
import { CuteLoadingAnimation } from './CuteLoadingAnimation';
import { GrammarStudyDisplay } from './GrammarStudyDisplay';

interface GrammarStudyResultsProps {
  entry: GrammarStudyEntry | null;
  catalogError?: string | null;
  aiErrorMessage?: string | null;
  isCatalogLoading: boolean;
  isGenerating: boolean;
  isAddingExamples: boolean;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onGenerateNotes: () => void;
  onAddMoreExamples: () => void;
  onClearNotes: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onMoveToAnalyzer: (text: string) => void;
  onCopyExamplesToAnalyzer: (mode: 'replace' | 'append') => void;
  onClose: () => void;
}

export const GrammarStudyResults: React.FC<GrammarStudyResultsProps> = ({
  entry,
  catalogError,
  aiErrorMessage,
  isCatalogLoading,
  isGenerating,
  isAddingExamples,
  canGoPrevious,
  canGoNext,
  onGenerateNotes,
  onAddMoreExamples,
  onClearNotes,
  onPrevious,
  onNext,
  onMoveToAnalyzer,
  onCopyExamplesToAnalyzer,
  onClose,
}) => {
  if (catalogError) {
    return <LearnErrorMessage message={catalogError} />;
  }

  if (isCatalogLoading && !entry) {
    return (
      <CuteLoadingAnimation
        message="Loading grammar catalog..."
        subMessage="JLPT grammar points from bundled assets"
      />
    );
  }

  if (!entry) {
    return null;
  }

  return (
    <div className="space-y-3">
      {aiErrorMessage && <LearnErrorMessage message={aiErrorMessage} />}
      <GrammarStudyDisplay
        entry={entry}
        isGenerating={isGenerating}
        isAddingExamples={isAddingExamples}
        canGoPrevious={canGoPrevious}
        canGoNext={canGoNext}
        onGenerateNotes={onGenerateNotes}
        onAddMoreExamples={onAddMoreExamples}
        onClearNotes={onClearNotes}
        onPrevious={onPrevious}
        onNext={onNext}
        onMoveToAnalyzer={onMoveToAnalyzer}
        onCopyExamplesToAnalyzer={onCopyExamplesToAnalyzer}
        onClose={onClose}
      />
    </div>
  );
};
