/** Composes analysis sections or loading/error. Hook: hooks/useSentenceAnalysis.ts */
import React from 'react';
import {SentenceAnalysis} from '../../types/sentenceAnalysis';
import {
  AnalysisBulletSection,
  AnalysisGrammarSection,
  AnalysisSummary,
  AnalysisTranslationSection,
  AnalysisVocabularySection,
} from './AIAnalysisSections';
import {LearnErrorMessage} from './LearnErrorMessage';
import {CuteLoadingAnimation} from './CuteLoadingAnimation';

interface AIAnalysisDisplayProps {
  analysis: SentenceAnalysis | null;
  isLoading?: boolean;
  errorMessage?: string;
}

export const AIAnalysisDisplay: React.FC<AIAnalysisDisplayProps> = ({
  analysis,
  isLoading = false,
  errorMessage,
}) => {
  if (errorMessage) {
    return <LearnErrorMessage message={errorMessage} />;
  }

  if (isLoading && !analysis) {
    return (
      <CuteLoadingAnimation
        message="Analyzing your sentence..."
        subMessage="Translation, grammar, vocabulary, and tips on the way"
      />
    );
  }

  if (!analysis) {
    return null;
  }

  return (
    <div className="space-y-4">
      <AnalysisSummary summary={analysis.summary} />
      <AnalysisTranslationSection translation={analysis.translation} />
      <AnalysisGrammarSection items={analysis.grammar} />
      <AnalysisVocabularySection items={analysis.vocabulary} />
      <AnalysisBulletSection
        icon="🏮"
        title="Cultural Notes"
        items={analysis.culturalNotes}
      />
      <AnalysisBulletSection
        icon="🎯"
        title="Learning Tips"
        items={analysis.learningTips}
      />
    </div>
  );
};
