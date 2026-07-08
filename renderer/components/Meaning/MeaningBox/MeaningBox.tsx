import React, { useCallback, useMemo } from 'react';
import { defaultMeaningBoxStyling } from '../../../utils/CJKStyling';
import useSpeech from '../../../hooks/useSpeech';
import { useStoreData } from '../../../hooks/useStoreData';
import { useUserNotes } from '../../../hooks/useUserNotes';
import { getDictionaryDefinitions } from '../meaningEntries';
import { UserNotesSection } from '../UserNotesSection';
import { CharacterContent } from './components/entries/CharacterContent';
import { MeaningContent } from './components/entries/MeaningContent';
import { DictionarySection } from './components/DictionarySection';
import { InflectionSection } from './components/InflectionSection';
import { MeaningBoxHeader } from './components/MeaningBoxHeader';
import { MeaningBoxShell } from './components/MeaningBoxShell';
import { QuickActionsSection } from './components/QuickActionsSection';
import { useMeaningAnkiExport } from './hooks/useMeaningAnkiExport';
import { useMeaningCopyShortcuts } from './hooks/useMeaningCopyShortcuts';
import { useMeaningInflection } from './hooks/useMeaningInflection';
import {
  useMeaningInflectionAi,
} from './hooks/useMeaningInflectionAi';
import { useMeaningLookup } from './hooks/useMeaningLookup';
import { useMeaningRomajied } from './hooks/useMeaningRomajied';
import { useMeaningUserNotes } from './hooks/useMeaningUserNotes';
import { videoConstants } from '../../../utils/constants';
import type { InflectionRow } from '../../../../main/handler/languages/inflectionTypes';
import type { MeaningBoxProps } from './types';

/**
 * Modal dictionary + notes panel for a single term.
 *
 * Composed of:
 * - {@link MeaningBoxHeader} — navigation, TTS, headword ruby
 * - {@link QuickActionsSection} — clipboard + Anki export
 * - {@link UserNotesSection} — personal notes (also used for Anki backs)
 * - {@link DictionarySection} — kanji/hanzi + word senses
 */
const MeaningBox = ({
  meaning,
  setMeaning,
  tokenizeMiteiru,
  subtitleStyling = defaultMeaningBoxStyling,
  customComponent = null,
  lang,
  changeLearningState = null,
  getLearningState = null,
  showMeaning = true,
  sidebarInsets = {},
  onMoveToAnalyzer,
}: MeaningBoxProps) => {
  const { speak, stop, speaking, supported } = useSpeech();
  const [selectedVoice] = useStoreData('tts.option.voice', '');
  const [openRouterApiKey] = useStoreData('openrouter.apiKey', '');
  const [openRouterModel] = useStoreData('openrouter.model', 'z-ai/glm-5.2:nitro');

  const {
    meaningContent,
    meaningCharacter,
    otherMeanings,
    meaningIndex,
    tags,
    goToPreviousMeaning,
    goToNextMeaning,
    isOpen,
  } = useMeaningLookup(meaning, lang, showMeaning);

  const { romajiedData, rubyHtmlContent } = useMeaningRomajied(
    meaning,
    lang,
    meaningContent,
    tokenizeMiteiru,
  );

  useMeaningCopyShortcuts(isOpen, meaning, rubyHtmlContent);

  const { table: inflectionTable } = useMeaningInflection(meaning, lang, meaningContent);
  const noteTerm = inflectionTable?.dictionaryForm || meaning;
  const notesApi = useUserNotes();
  const { getUserNote, setUserNote, userNotes } = notesApi;

  const {
    userNote,
    isGeneratingNote,
    saveNote,
    deleteNote,
    generateNoteWithAI,
  } = useMeaningUserNotes(noteTerm, lang, notesApi);

  const wordMeaning = useMemo(() => {
    const definitions = getDictionaryDefinitions(meaningContent, lang);
    return definitions[0] ?? '';
  }, [lang, meaningContent]);

  const {
    inflectionExamples,
    isGenerating: isGeneratingInflectionExamples,
    errorMessage: inflectionAiError,
    generateExamples: generateInflectionExamples,
  } = useMeaningInflectionAi({
    openRouterApiKey,
    openRouterModel,
    noteTerm,
    getUserNote,
    setUserNote,
    userNotes,
  });

  const handleGenerateInflectionExamples = useCallback(
    async (rows: InflectionRow[]) => {
      if (!inflectionTable) {
        return;
      }
      await generateInflectionExamples(inflectionTable, rows, wordMeaning);
    },
    [generateInflectionExamples, inflectionTable, wordMeaning],
  );

  const { isExportingAnki, exportToAnki, ankiExportModal } = useMeaningAnkiExport({
    meaning,
    lang,
    tokenizeMiteiru,
    meaningContent,
    romajiedData,
    rubyHtmlContent,
    userNote,
  });

  const handleSpeak = useCallback(() => {
    if (speaking) {
      stop();
    } else {
      speak(meaning, { lang, voice: selectedVoice });
    }
  }, [lang, meaning, selectedVoice, speak, speaking, stop]);

  const handleClose = useCallback(() => setMeaning(''), [setMeaning]);

  const handleNavigateToTerm = useCallback(
    (term: string) => setMeaning(term),
    [setMeaning],
  );

  const characterPanel = useMemo(() => {
    if (!showMeaning) {
      return null;
    }
    return (
      <CharacterContent
        lang={lang}
        meaningCharacter={meaningCharacter}
        setMeaning={setMeaning}
        subtitleStyling={subtitleStyling}
      />
    );
  }, [lang, meaningCharacter, setMeaning, showMeaning, subtitleStyling]);

  const meaningPanel = useMemo(() => {
    if (!showMeaning) {
      return null;
    }
    return (
      <MeaningContent meaningContent={meaningContent} lang={lang} tags={tags} />
    );
  }, [lang, meaningContent, showMeaning, tags]);

  if (!isOpen) {
    return <>{ankiExportModal}</>;
  }

  return (
    <>
      {ankiExportModal}
      <MeaningBoxShell
        sidebarInsets={sidebarInsets}
        onClose={handleClose}
        customComponent={customComponent}
        header={
          <MeaningBoxHeader
            meaning={meaning}
            meaningIndex={meaningIndex}
            otherMeaningsCount={otherMeanings.length}
            romajiedData={romajiedData}
            lang={lang}
            setMeaning={setMeaning}
            subtitleStyling={subtitleStyling}
            speaking={speaking}
            speechSupported={supported}
            onSpeak={handleSpeak}
            onPrevious={goToPreviousMeaning}
            onNext={goToNextMeaning}
            getLearningState={getLearningState}
            changeLearningState={changeLearningState}
          />
        }
      >
        <QuickActionsSection
          meaning={meaning}
          rubyHtmlContent={rubyHtmlContent}
          isExportingAnki={isExportingAnki}
          onExportAnki={exportToAnki}
        />

        <UserNotesSection
          term={noteTerm}
          lang={lang}
          tokenizeMiteiru={tokenizeMiteiru}
          userNote={userNote}
          onSave={saveNote}
          onDelete={deleteNote}
          onAIGenerate={generateNoteWithAI}
          isGenerating={isGeneratingNote}
          onNavigateToTerm={handleNavigateToTerm}
        />

        {lang === videoConstants.japaneseLang && inflectionTable ? (
          <InflectionSection
            table={inflectionTable}
            lang={lang}
            tokenizeMiteiru={tokenizeMiteiru}
            examples={inflectionExamples}
            onNavigateToTerm={handleNavigateToTerm}
            onGenerateExamples={handleGenerateInflectionExamples}
            isGenerating={isGeneratingInflectionExamples}
            errorMessage={inflectionAiError}
          />
        ) : null}

        <DictionarySection
          characterContent={characterPanel}
          meaningContent={meaningPanel}
        />
      </MeaningBoxShell>
    </>
  );
};

export default MeaningBox;
