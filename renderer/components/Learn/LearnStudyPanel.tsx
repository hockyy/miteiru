/**
 * Learn page — left column: AI translation + Japanese grammar study.
 * Translation: hooks/useAiTranslation.ts
 * Grammar: hooks/useGrammarStudy.ts, useGrammarNotes.ts, useGrammarAiNotes.ts
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Button } from '../Utils/Button';
import { languageCodes, getLanguageDisplayName } from '../../languages/manifest';
import { useAiTranslation } from '../../hooks/useAiTranslation';
import { useGrammarAiNotes } from '../../hooks/useGrammarAiNotes';
import { useGrammarNotes } from '../../hooks/useGrammarNotes';
import { useGrammarStudy } from '../../hooks/useGrammarStudy';
import { openRouterMessages } from '../../utils/openRouterClient';
import {
  getPronunciationLabel,
  getTranslationTargetLang,
} from '../../utils/aiTranslationPrompts';
import { splitIntoLines } from '../../utils/textUtils';
import { AITranslationResults } from './AITranslationResults';
import { GrammarStudyControls } from './GrammarStudyControls';
import { GrammarStudyResults } from './GrammarStudyResults';

type ActiveStudyPanel = 'translation' | 'grammar' | null;

interface LearnStudyPanelProps {
  lang: string;
  openRouterApiKey: string;
  openRouterModel: string;
  onMoveToAnalyzer: (text: string) => void;
  onAppendToAnalyzer: (text: string) => void;
}

export const LearnStudyPanel: React.FC<LearnStudyPanelProps> = ({
  lang,
  openRouterApiKey,
  openRouterModel,
  onMoveToAnalyzer,
  onAppendToAnalyzer,
}) => {
  const [sourceInput, setSourceInput] = useState('');
  const [activePanel, setActivePanel] = useState<ActiveStudyPanel>(null);

  const isJapanese = lang === languageCodes.japanese;

  const {
    result: translationResult,
    errorMessage: translationErrorMessage,
    isTranslating,
    hasResults,
    translate,
    clearResults,
  } = useAiTranslation({ lang, openRouterApiKey, openRouterModel });

  const { getGrammarNote, setGrammarNote, deleteGrammarNote } = useGrammarNotes();

  const {
    levelFilter,
    setLevelFilter,
    filteredCount,
    currentStudyEntry,
    isCatalogLoading,
    catalogError,
    hasGrammarResult,
    canGoPrevious,
    canGoNext,
    pickRandom,
    goToAdjacent,
    clearCurrent,
  } = useGrammarStudy({ enabled: isJapanese, getGrammarNote });

  const {
    isGenerating,
    isAddingExamples,
    errorMessage: grammarAiErrorMessage,
    generateNotes,
    addMoreExamples,
    clearNotes,
    clearError: clearGrammarAiError,
  } = useGrammarAiNotes({
    openRouterApiKey,
    openRouterModel,
    getGrammarNote,
    setGrammarNote,
    deleteGrammarNote,
  });

  const sourceSentences = useMemo(() => splitIntoLines(sourceInput), [sourceInput]);
  const targetLang = getTranslationTargetLang(lang);
  const missingApiKey = !openRouterApiKey.trim();
  const missingModel = !openRouterModel.trim();
  const missingSentences = sourceSentences.length === 0;
  const unsupportedLang = lang !== '' && !targetLang;
  const pronunciationLabel = targetLang ? getPronunciationLabel(targetLang) : 'Reading';
  const languageLabel = targetLang ? getLanguageDisplayName(lang) : 'target language';

  const translateWithAI = useCallback(() => {
    clearCurrent();
    clearGrammarAiError();
    setActivePanel('translation');
    translate(sourceSentences);
  }, [clearCurrent, clearGrammarAiError, sourceSentences, translate]);

  const pickRandomGrammar = useCallback(() => {
    clearResults();
    clearGrammarAiError();
    const picked = pickRandom();
    if (picked) {
      setActivePanel('grammar');
    }
  }, [clearGrammarAiError, clearResults, pickRandom]);

  const handleCloseTranslation = useCallback(() => {
    clearResults();
    setActivePanel((current) => (current === 'translation' ? null : current));
  }, [clearResults]);

  const handleCloseGrammar = useCallback(() => {
    clearCurrent();
    clearGrammarAiError();
    setActivePanel((current) => (current === 'grammar' ? null : current));
  }, [clearCurrent, clearGrammarAiError]);

  const handleGenerateNotes = useCallback(async () => {
    if (!currentStudyEntry) return;
    clearGrammarAiError();
    await generateNotes(currentStudyEntry);
  }, [clearGrammarAiError, currentStudyEntry, generateNotes]);

  const handleAddMoreExamples = useCallback(async () => {
    if (!currentStudyEntry) return;
    clearGrammarAiError();
    await addMoreExamples(currentStudyEntry);
  }, [addMoreExamples, clearGrammarAiError, currentStudyEntry]);

  const handleClearNotes = useCallback(async () => {
    if (!currentStudyEntry) return;
    await clearNotes(currentStudyEntry.id);
  }, [clearNotes, currentStudyEntry]);

  const handleCopyExamplesToAnalyzer = useCallback(
    (mode: 'replace' | 'append') => {
      const examples = (currentStudyEntry?.userData?.examples ?? [])
        .map((example) => example.sentence.trim())
        .filter(Boolean);

      if (examples.length === 0) {
        return;
      }

      const text = examples.join('\n');
      if (mode === 'append') {
        onAppendToAnalyzer(text);
      } else {
        onMoveToAnalyzer(text);
      }
    },
    [currentStudyEntry?.userData?.examples, onAppendToAnalyzer, onMoveToAnalyzer],
  );

  const showTranslationResults =
    activePanel === 'translation' && (hasResults || isTranslating || Boolean(translationErrorMessage));

  const showGrammarResults =
    activePanel === 'grammar' && (hasGrammarResult || isCatalogLoading || Boolean(catalogError));

  const showResultsSection = showTranslationResults || showGrammarResults;

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-purple-50 to-pink-50 overflow-hidden">
      <div className="p-4 border-b-2 border-purple-200 flex-shrink-0">
        <h3 className="text-purple-900 font-bold text-xl">Study tools</h3>
        <p className="text-sm text-purple-700 mt-1">
          AI translation{isJapanese ? ' and JLPT grammar' : ''} for {languageLabel}
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

        <div className="flex flex-wrap gap-2">
          <Button
            type="primary"
            onPress={translateWithAI}
            disabled={isTranslating}
          >
            {isTranslating ? 'Translating...' : 'Translate with AI'}
          </Button>
        </div>

        {isJapanese && (
          <GrammarStudyControls
            levelFilter={levelFilter}
            filteredCount={filteredCount}
            isCatalogLoading={isCatalogLoading}
            isPicking={false}
            onLevelFilterChange={setLevelFilter}
            onPickRandom={pickRandomGrammar}
          />
        )}

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

      {showResultsSection && (
        <div className="flex-1 overflow-hidden flex flex-col border-t-2 border-purple-200 min-h-0">
          <div className="flex justify-between items-center px-4 py-2 flex-shrink-0">
            <h4 className="text-purple-900 font-semibold text-sm">
              {showGrammarResults ? 'Grammar' : 'Translation results'}
            </h4>
            {showTranslationResults && hasResults && (
              <button
                onClick={handleCloseTranslation}
                className="text-purple-600 hover:text-purple-800 hover:bg-purple-100 rounded-full w-6 h-6 flex items-center justify-center font-bold text-sm transition-colors"
                title="Clear"
              >
                ✕
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
            {showGrammarResults ? (
              <GrammarStudyResults
                entry={currentStudyEntry}
                catalogError={catalogError}
                aiErrorMessage={grammarAiErrorMessage}
                isCatalogLoading={isCatalogLoading}
                isGenerating={isGenerating}
                isAddingExamples={isAddingExamples}
                canGoPrevious={canGoPrevious}
                canGoNext={canGoNext}
                onGenerateNotes={handleGenerateNotes}
                onAddMoreExamples={handleAddMoreExamples}
                onClearNotes={handleClearNotes}
                onPrevious={() => goToAdjacent(-1)}
                onNext={() => goToAdjacent(1)}
                onMoveToAnalyzer={onMoveToAnalyzer}
                onCopyExamplesToAnalyzer={handleCopyExamplesToAnalyzer}
                onClose={handleCloseGrammar}
              />
            ) : (
              <AITranslationResults
                result={translationResult}
                isLoading={isTranslating}
                errorMessage={translationErrorMessage ?? undefined}
                pronunciationLabel={pronunciationLabel}
                onMoveToAnalyzer={onMoveToAnalyzer}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
