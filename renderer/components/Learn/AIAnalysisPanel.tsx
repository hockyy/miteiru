/** Right-column analysis shell on /learn. Content: AIAnalysisDisplay.tsx */
import React from 'react';
import {SentenceAnalysis} from '../../types/sentenceAnalysis';
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
    <div className="flex flex-col h-full bg-purple-50 overflow-hidden">
      <div className="flex justify-between items-center p-4 pb-2 border-b-2 border-purple-200 flex-shrink-0">
        <h3 className="text-purple-900 font-bold text-base">AI Analysis</h3>
        <button
          onClick={onClose}
          className="text-purple-600 hover:text-purple-800 hover:bg-purple-100 rounded-full w-6 h-6 flex items-center justify-center font-bold text-sm transition-colors"
          title="Close"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <AIAnalysisDisplay
          analysis={analysis}
          isLoading={isAnalyzing}
          errorMessage={errorMessage}
        />
      </div>
    </div>
  );
};
