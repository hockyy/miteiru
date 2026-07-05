/**
 * Learn page — AI translation UI (left column on /learn).
 * Logic: hooks/useAiTranslation.ts | Prompts: utils/aiTranslationPrompts.ts
 * Results UI: AITranslationResults, TranslationSentenceCard, TranslationVariantRow, CopyButton
 * Shared: utils/openRouterClient.ts, utils/parseJsonResponse.ts, LearnErrorMessage, CuteLoadingAnimation, components/Utils/CopyButton
 * Move-to-analyzer callback is wired in pages/learn.tsx → middle column + useSentenceAnalysis
 */
import React, { useCallback, useMemo, useState } from 'react';
import { AwesomeButton } from 'react-awesome-button';
import { getLanguageDisplayName } from '../../languages/manifest';
import { useAiTranslation } from '../../hooks/useAiTranslation';
import { openRouterMessages } from '../../utils/openRouterClient';
import {
  getPronunciationLabel,
  getTranslationTargetLang,
} from '../../utils/aiTranslationPrompts';
import { splitIntoLines } from '../../utils/textUtils';
import { AITranslationResults } from './AITranslationResults';

interface AITranslationPanelProps {
  lang: string;
  openRouterApiKey: string;
  openRouterModel: string;
  onMoveToAnalyzer: (text: string) => void;
}

export const AITranslationPanel: React.FC<AITranslationPanelProps> = ({
  lang,
  openRouterApiKey,
  openRouterModel,
  onMoveToAnalyzer,
}) => {
  const [sourceInput, setSourceInput] = useState('');
  const {
    result: translationResult,
    errorMessage,
    isTranslating,
    hasResults,
    translate,
    clearResults,
  } = useAiTranslation({ lang, openRouterApiKey, openRouterModel });

  const sourceSentences = useMemo(() => splitIntoLines(sourceInput), [sourceInput]);
  const targetLang = getTranslationTargetLang(lang);
  // Shown under the button; translate() still validates and sets errorMessage on click
  const missingApiKey = !openRouterApiKey.trim();
  const missingModel = !openRouterModel.trim();
  const missingSentences = sourceSentences.length === 0;
  const unsupportedLang = lang !== '' && !targetLang;
  const pronunciationLabel = targetLang ? getPronunciationLabel(targetLang) : 'Reading';
  const languageLabel = targetLang ? getLanguageDisplayName(lang) : 'target language';

  const translateWithAI = useCallback(() => {
    translate(sourceSentences);
  }, [sourceSentences, translate]);

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-purple-50 to-pink-50 overflow-hidden">
      <div className="p-4 border-b-2 border-purple-200 flex-shrink-0">
        <h3 className="text-purple-900 font-bold text-xl">AI Translation</h3>
        <p className="text-sm text-purple-700 mt-1">
          Formal, neutral, and casual {languageLabel} for each line
        </p>
      </div>

      <div className="p-4 space-y-4 flex-shrink-0">
        <div>
          <label className="text-purple-900 font-semibold mb-2 block text-sm">
            Text to translate
          </label>
          <textarea
            className="text-black w-full p-3 border-2 border-purple-300 rounded-lg min-h-[180px] resize-y focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200 transition-colors text-sm"
            value={sourceInput}
            onChange={(e) => setSourceInput(e.target.value)}
            placeholder="Enter your text here. Each line will be translated separately."
          />
        </div>

        <AwesomeButton
          type="primary"
          onPress={translateWithAI}
          disabled={isTranslating}
        >
          {isTranslating ? 'Translating...' : 'Translate with AI'}
        </AwesomeButton>

        <div className="text-xs text-purple-600 space-y-1">
          {sourceSentences.length > 0 && (
            <p>{sourceSentences.length} line{sourceSentences.length !== 1 ? 's' : ''} to translate</p>
          )}
          {missingSentences && (
            <p className="text-amber-700">Enter text above (one sentence per line).</p>
          )}
          {missingApiKey && (
            <p className="text-amber-700">{openRouterMessages.missingApiKey}</p>
          )}
          {missingModel && (
            <p className="text-amber-700">{openRouterMessages.missingModel}</p>
          )}
          {unsupportedLang && (
            <p className="text-amber-700">AI translation supports Japanese, Chinese, and Cantonese only.</p>
          )}
        </div>
      </div>

      {hasResults && (
        <div className="flex-1 overflow-hidden flex flex-col border-t-2 border-purple-200 min-h-0">
          <div className="flex justify-between items-center px-4 py-2 flex-shrink-0">
            <h4 className="text-purple-900 font-semibold text-sm">Results</h4>
            <button
              onClick={clearResults}
              className="text-purple-600 hover:text-purple-800 hover:bg-purple-100 rounded-full w-6 h-6 flex items-center justify-center font-bold text-sm transition-colors"
              title="Clear"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
            <AITranslationResults
              result={translationResult}
              isLoading={isTranslating}
              errorMessage={errorMessage ?? undefined}
              pronunciationLabel={pronunciationLabel}
              onMoveToAnalyzer={onMoveToAnalyzer}
            />
          </div>
        </div>
      )}
    </div>
  );
};
