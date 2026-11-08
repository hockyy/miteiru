/**
 * AI translation state + OpenRouter call for /learn left column.
 * UI shell: components/Learn/LearnStudyPanel.tsx
 * For analysis instead of translation see hooks/useSentenceAnalysis.ts
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AITranslationResult } from '../types/aiTranslation';
import {
  buildTranslationSystemPrompt,
  buildTranslationUserPrompt,
  defaultTranslationDetailOptions,
  getTranslationTargetLang,
  getUnsupportedLangMessage,
  normalizeTranslationDetailOptions,
  TranslationDetailOptions,
} from '../utils/aiTranslationPrompts';
import { aiResultCache, AiResultError, isAbortError, makeAiCacheKey } from '../utils/aiResultCache';
import { createPartialHandler } from '../utils/aiStreaming';
import { openRouterMessages, streamOpenRouterCompletion } from '../utils/openRouterClient';
import { normalizePartialAiTranslation, parseAiTranslation } from '../utils/parseAiTranslation';

interface UseAiTranslationOptions {
  lang: string;
  openRouterApiKey: string;
  openRouterModel: string;
}

export function useAiTranslation({
  lang,
  openRouterApiKey,
  openRouterModel,
}: UseAiTranslationOptions) {
  const [result, setResult] = useState<AITranslationResult | null>(null);
  // What the shown result was asked to include; toggles changed afterwards apply to the next request.
  const [resultDetails, setResultDetails] = useState<TranslationDetailOptions>(defaultTranslationDetailOptions);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);

  const controllerRef = useRef<AbortController | null>(null);

  // Cancels the request in flight (new request, clear, or unmount).
  const cancelRequest = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  useEffect(() => cancelRequest, [cancelRequest]);

  const clearResults = useCallback(() => {
    cancelRequest();
    setIsTranslating(false);
    setResult(null);
    setErrorMessage(null);
  }, [cancelRequest]);

  const translate = useCallback(async (
    sentences: string[],
    details: TranslationDetailOptions = defaultTranslationDetailOptions,
  ) => {
    const detailOptions = normalizeTranslationDetailOptions(details);
    const nonEmptySentences = sentences.map(s => s.trim()).filter(Boolean);
    const targetLang = getTranslationTargetLang(lang);
    const fail = (message: string) => {
      cancelRequest();
      setIsTranslating(false);
      setResult(null);
      setErrorMessage(message);
    };

    // Fail fast with user-facing hints (panel also shows these before click)
    if (!openRouterApiKey.trim()) {
      fail(openRouterMessages.missingApiKey);
      return;
    }

    if (!openRouterModel.trim()) {
      fail(openRouterMessages.missingModel);
      return;
    }

    if (!targetLang) {
      fail(getUnsupportedLangMessage(lang));
      return;
    }

    if (nonEmptySentences.length === 0) {
      fail('Enter text to translate (one sentence per line).');
      return;
    }

    const previous = controllerRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    // Partial results stop once this request has settled (or was replaced), so a parse that finishes
    // late can't put a half answer over the final one, or beside an error.
    let settled = false;
    const isStale = () => settled || controller.signal.aborted;

    setIsTranslating(true);
    setResult(null);
    setErrorMessage(null);
    setResultDetails(detailOptions);

    try {
      const request = aiResultCache.run<AITranslationResult>(
        makeAiCacheKey('translation', openRouterModel, lang, nonEmptySentences, detailOptions),
        async ({ signal, onText }) => {
          const rawResponse = await streamOpenRouterCompletion(
            openRouterApiKey,
            openRouterModel,
            [
              { role: 'system', content: buildTranslationSystemPrompt(targetLang, detailOptions) },
              { role: 'user', content: buildTranslationUserPrompt(nonEmptySentences) },
            ],
            { signal, onText },
          );

          // Model returns JSON; tolerate ```json fences via parseAiTranslation → parseJsonResponse
          const result = parseAiTranslation(rawResponse);
          if (!result) {
            throw new AiResultError('Could not parse translation result. Try again.');
          }
          return result;
        },
        {
          signal: controller.signal,
          onText: createPartialHandler(normalizePartialAiTranslation, setResult, isStale),
        },
      );
      // Cancel the previous request only now: if it asked the same thing, this one has joined it in the
      // cache, so it carries on instead of starting over.
      previous?.abort();
      const parsed = await request;

      if (isStale()) {
        return;
      }
      setResult(parsed);
      setErrorMessage(null);
    } catch (error) {
      if (isStale() || isAbortError(error)) {
        return;
      }
      if (error instanceof AiResultError) {
        setResult(null);
        setErrorMessage(error.message);
        return;
      }
      console.error('AI translation failed:', error);
      setResult(null);
      setErrorMessage(`Translation failed: ${error.message || 'Unknown error occurred'}`);
    } finally {
      settled = true;
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setIsTranslating(false);
      }
    }
  }, [cancelRequest, lang, openRouterApiKey, openRouterModel]);
  const hasResults = isTranslating || !!result || !!errorMessage;

  return {
    result,
    resultDetails,
    errorMessage,
    isTranslating,
    hasResults,
    translate,
    clearResults,
  };
}
