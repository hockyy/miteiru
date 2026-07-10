/** Right-column analysis shell on /learn. Content: AIAnalysisDisplay.tsx */
import React from 'react';
import {SentenceAnalysis} from '../../types/sentenceAnalysis';
import {MiteiruPanel, UI_ACTION_BTN} from '../UI';
import {AIAnalysisDisplay} from './AIAnalysisDisplay';

interface AIAnalysisPanelProps {
  analysis: SentenceAnalysis | null;
  isAnalyzing: boolean;
  errorMessage?: string;
  onClose: () => void;
}

export const AIAnalysisPanel: React.FC<AIAnalysisPanelProps> = ({
  analysis,
  isAnalyzing,
  errorMessage,
  onClose,
}) => {
  const isVisible = isAnalyzing || !!analysis || !!errorMessage;
  if (!isVisible) {
    return null;
  }

  return (
    <MiteiruPanel
      fill
      variant="purple"
      label="AI Analysis"
      className="h-full"
      headerAction={
        <button type="button" onClick={onClose} className={UI_ACTION_BTN} title="Close">
          ✕
        </button>
      }
    >
      <AIAnalysisDisplay
        analysis={analysis}
        isLoading={isAnalyzing}
        errorMessage={errorMessage}
      />
    </MiteiruPanel>
  );
};
