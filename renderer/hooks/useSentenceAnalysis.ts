/**
 * AI sentence analysis state + OpenRouter call for /learn right column.
 * UI: components/Learn/AIAnalysisPanel.tsx, AIAnalysisDisplay.tsx
 * Translation counterpart: hooks/useAiTranslation.ts
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { SentenceAnalysis } from '../types/sentenceAnalysis';
import { buildAnalysisSystemPrompt, buildAnalysisUserPrompt } from '../utils/aiAnalysisPrompts';
import { aiResultCache, AiResultError, isAbortError, makeAiCacheKey } from '../utils/aiResultCache';
import { createPartialHandler } from '../utils/aiStreaming';
import { openRouterMessages, streamOpenRouterCompletion } from '../utils/openRouterClient';
import {
  isAnalysisErrorMessage,
  normalizePartialSentenceAnalysis,
  parseSentenceAnalysis,
} from '../utils/parseSentenceAnalysis';

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

  const controllerRef = useRef<AbortController | null>(null);

  // Cancels the request in flight (new request, clear, or unmount).
  const cancelRequest = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  useEffect(() => cancelRequest, [cancelRequest]);

  const clearAnalysis = useCallback(() => {
    cancelRequest();
    setIsAnalyzing(false);
    setAnalysis(null);
    setErrorMessage(null);
  }, [cancelRequest]);

  const analyzeSentence = useCallback(async (sentence: string) => {
    const trimmed = sentence.trim();
    const fail = (message: string) => {
      cancelRequest();
      setIsAnalyzing(false);
      setAnalysis(null);
      setErrorMessage(message);
    };

    if (!openRouterApiKey.trim()) {
      fail(openRouterMessages.missingApiKey);
      return;
    }

    if (!trimmed) {
      fail('Please enter a sentence to analyze.');
      return;
    }

    const previous = controllerRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    // Partial results stop once this request has settled (or was replaced), so a parse that finishes
    // late can't put a half answer over the final one, or beside an error.
    let settled = false;
    const isStale = () => settled || controller.signal.aborted;

    setIsAnalyzing(true);
    setAnalysis(null);
    setErrorMessage(null);

    try {
      const request = aiResultCache.run<SentenceAnalysis>(
        makeAiCacheKey('analysis', openRouterModel, lang, trimmed),
        async ({ signal, onText }) => {
          const rawResponse = await streamOpenRouterCompletion(
            openRouterApiKey,
            openRouterModel,
            [
              { role: 'system', content: buildAnalysisSystemPrompt(lang) },
              { role: 'user', content: buildAnalysisUserPrompt(trimmed, lang) },
            ],
            { signal, onText },
          );

          const result = parseSentenceAnalysis(rawResponse);
          if (result) {
            return result;
          }
          if (isAnalysisErrorMessage(rawResponse)) {
            // Rare: model echoed a plain-text error instead of JSON
            throw new AiResultError(rawResponse);
          }
          throw new AiResultError('Could not parse AI analysis. Try again.');
        },
        {
          signal: controller.signal,
          onText: createPartialHandler(normalizePartialSentenceAnalysis, setAnalysis, isStale),
        },
      );
      // Cancel the previous request only now: if it asked the same thing, this one has joined it in the
      // cache, so it carries on instead of starting over.
      previous?.abort();
      const parsed = await request;

      if (isStale()) {
        return;
      }
      setAnalysis(parsed);
      setErrorMessage(null);
    } catch (error) {
      if (isStale() || isAbortError(error)) {
        return;
      }
      if (error instanceof AiResultError) {
        setAnalysis(null);
        setErrorMessage(error.message);
        return;
      }
      console.error('AI Analysis failed:', error);
      setAnalysis(null);
      setErrorMessage(`Analysis failed: ${error.message || 'Unknown error occurred'}`);
    } finally {
      settled = true;
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setIsAnalyzing(false);
      }
    }
  }, [cancelRequest, lang, openRouterApiKey, openRouterModel]);
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
