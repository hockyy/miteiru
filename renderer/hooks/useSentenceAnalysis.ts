/**
 * AI sentence analysis state + OpenRouter call for /learn right column.
 * UI: components/Learn/AIAnalysisPanel.tsx, AIAnalysisDisplay.tsx
 * Translation counterpart: hooks/useAiTranslation.ts
 */
import { useCallback, useState } from 'react';
import { SentenceAnalysis } from '../types/sentenceAnalysis';
import { buildAnalysisSystemPrompt, buildAnalysisUserPrompt } from '../utils/aiAnalysisPrompts';
import { openRouterMessages, streamOpenRouterCompletion } from '../utils/openRouterClient';
import { isAnalysisErrorMessage, parseSentenceAnalysis } from '../utils/parseSentenceAnalysis';

interface UseSentenceAnalysisOptions {
  openRouterApiKey: string;
  openRouterModel: string;
  lang: string;
}

export function useSentenceAnalysis({
  openRouterApiKey,
  openRouterModel,
  lang,
}: UseSentenceAnalysisOptions) {
  const [analysis, setAnalysis] = useState<SentenceAnalysis | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const clearAnalysis = useCallback(() => {
    setAnalysis(null);
    setErrorMessage(null);
  }, []);

  const analyzeSentence = useCallback(async (sentence: string) => {
    const trimmed = sentence.trim();

    if (!openRouterApiKey.trim()) {
      setAnalysis(null);
      setErrorMessage(openRouterMessages.missingApiKey);
      return;
    }

    if (!trimmed) {
      setAnalysis(null);
      setErrorMessage('Please enter a sentence to analyze.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysis(null);
    setErrorMessage(null);

    try {
      const rawResponse = await streamOpenRouterCompletion(
        openRouterApiKey,
        openRouterModel,
        [
          { role: 'system', content: buildAnalysisSystemPrompt(lang) },
          { role: 'user', content: buildAnalysisUserPrompt(trimmed, lang) },
        ],
      );

      const parsed = parseSentenceAnalysis(rawResponse);
      if (parsed) {
        setAnalysis(parsed);
        setErrorMessage(null);
      } else if (isAnalysisErrorMessage(rawResponse)) {
        // Rare: model echoed a plain-text error instead of JSON
        setErrorMessage(rawResponse);
      } else {
        setErrorMessage('Could not parse AI analysis. Try again.');
      }
    } catch (error) {
      console.error('AI Analysis failed:', error);
      setErrorMessage(`Analysis failed: ${error.message || 'Unknown error occurred'}`);
    } finally {
      setIsAnalyzing(false);
    }
  }, [lang, openRouterApiKey, openRouterModel]);

  const hasAnalysisPanel = isAnalyzing || !!analysis || !!errorMessage;

  return {
    analysis,
    errorMessage,
    isAnalyzing,
    hasAnalysisPanel,
    analyzeSentence,
    clearAnalysis,
  };
}
