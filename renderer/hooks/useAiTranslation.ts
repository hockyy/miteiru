/**
 * AI translation state + OpenRouter call for /learn left column.
 * UI shell: components/Learn/AITranslationPanel.tsx
 * For analysis instead of translation see hooks/useSentenceAnalysis.ts
 */
import { useCallback, useState } from 'react';
import { AITranslationResult } from '../types/aiTranslation';
import {
  buildTranslationSystemPrompt,
  buildTranslationUserPrompt,
  getTranslationTargetLang,
  getUnsupportedLangMessage,
} from '../utils/aiTranslationPrompts';
import { openRouterMessages, streamOpenRouterCompletion } from '../utils/openRouterClient';
import { parseAiTranslation } from '../utils/parseAiTranslation';

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);

  const clearResults = useCallback(() => {
    setResult(null);
    setErrorMessage(null);
  }, []);

  const translate = useCallback(async (sentences: string[]) => {
    const nonEmptySentences = sentences.map(s => s.trim()).filter(Boolean);
    const targetLang = getTranslationTargetLang(lang);

    // Fail fast with user-facing hints (panel also shows these before click)
    if (!openRouterApiKey.trim()) {
      setResult(null);
      setErrorMessage(openRouterMessages.missingApiKey);
      return;
    }

    if (!openRouterModel.trim()) {
      setResult(null);
      setErrorMessage(openRouterMessages.missingModel);
      return;
    }

    if (!targetLang) {
      setResult(null);
      setErrorMessage(getUnsupportedLangMessage(lang));
      return;
    }

    if (nonEmptySentences.length === 0) {
      setResult(null);
      setErrorMessage('Enter text to translate (one sentence per line).');
      return;
    }

    setIsTranslating(true);
    setResult(null);
    setErrorMessage(null);

    try {
      const rawResponse = await streamOpenRouterCompletion(
        openRouterApiKey,
        openRouterModel,
        [
          { role: 'system', content: buildTranslationSystemPrompt(targetLang) },
          { role: 'user', content: buildTranslationUserPrompt(nonEmptySentences) },
        ],
      );

      // Model returns JSON; tolerate ```json fences via parseAiTranslation → parseJsonResponse
      const parsed = parseAiTranslation(rawResponse);
      if (parsed) {
        setResult(parsed);
        setErrorMessage(null);
      } else {
        setErrorMessage('Could not parse translation result. Try again.');
      }
    } catch (error) {
      console.error('AI translation failed:', error);
      setErrorMessage(`Translation failed: ${error.message || 'Unknown error occurred'}`);
    } finally {
      setIsTranslating(false);
    }
  }, [lang, openRouterApiKey, openRouterModel]);

  const hasResults = isTranslating || !!result || !!errorMessage;

  return {
    result,
    errorMessage,
    isTranslating,
    hasResults,
    translate,
    clearResults,
  };
}
