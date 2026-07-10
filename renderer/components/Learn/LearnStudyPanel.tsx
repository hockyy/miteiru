/**
 * Learn page — left column: AI translation + Japanese grammar study.
 * Translation: hooks/useAiTranslation.ts
 * Grammar: hooks/useGrammarStudy.ts, useGrammarNotes.ts, useGrammarAiNotes.ts
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Button } from '../Utils/Button';
import { languageCodes } from '../../languages/manifest';
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
import {
  MiteiruActionBar,
  MiteiruPanel,
  UI_ACTION_BTN,
  UI_HINT_TEXT,
  UI_STUDY_COLUMN_BG,
  UI_TEXTAREA,
} from '../UI';
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
    <div className={`flex h-full flex-col overflow-hidden ${UI_STUDY_COLUMN_BG}`}>
      <div
        className={`space-y-3 p-3 ${showResultsSection ? 'shrink-0' : 'min-h-0 flex-1 overflow-y-auto'}`}
      >
        <MiteiruPanel label="Text to translate">
          <textarea
            className={`${UI_TEXTAREA} min-h-[160px]`}
            value={sourceInput}
            onChange={(e) => setSourceInput(e.target.value)}
            placeholder="Each line will be translated separately."
          />
        </MiteiruPanel>

        <MiteiruActionBar>
          <Button type="primary" size="small" onPress={translateWithAI} disabled={isTranslating}>
            {isTranslating ? 'Translating…' : 'Translate with AI'}
          </Button>
        </MiteiruActionBar>

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

        <div className={`${UI_HINT_TEXT} space-y-1`}>
          {sourceSentences.length > 0 && (
            <p>{sourceSentences.length} line{sourceSentences.length !== 1 ? 's' : ''} to translate</p>
          )}
          {missingSentences && (
            <p className="text-amber-800">Enter text above (one sentence per line).</p>
          )}
          {missingApiKey && (
            <p className="text-amber-800">{openRouterMessages.missingApiKey}</p>
          )}
          {missingModel && (
            <p className="text-amber-800">{openRouterMessages.missingModel}</p>
          )}
          {unsupportedLang && (
            <p className="text-amber-800">AI translation supports Japanese, Chinese, and Cantonese only.</p>
          )}
        </div>
      </div>

      {showResultsSection && (
        <div className="flex min-h-0 flex-1 flex-col p-3 pt-0">
          <MiteiruPanel
            fill
            variant={showGrammarResults ? 'default' : 'purple'}
            label={showGrammarResults ? 'Grammar' : 'Translation'}
            className="h-full"
            headerAction={
              showTranslationResults && hasResults ? (
                <button type="button" onClick={handleCloseTranslation} className={UI_ACTION_BTN} title="Clear">
                  ✕
                </button>
              ) : undefined
            }
          >
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
          </MiteiruPanel>
        </div>
      )}
    </div>
  );
};
