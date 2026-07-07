import React, { useCallback, useMemo } from 'react';
import { defaultMeaningBoxStyling } from '../../../utils/CJKStyling';
import useSpeech from '../../../hooks/useSpeech';
import { useStoreData } from '../../../hooks/useStoreData';
import { UserNotesSection } from '../UserNotesSection';
import { CharacterContent } from './components/entries/CharacterContent';
import { MeaningContent } from './components/entries/MeaningContent';
import { DictionarySection } from './components/DictionarySection';
import { MeaningBoxHeader } from './components/MeaningBoxHeader';
import { MeaningBoxShell } from './components/MeaningBoxShell';
import { QuickActionsSection } from './components/QuickActionsSection';
import { useMeaningAnkiExport } from './hooks/useMeaningAnkiExport';
import { useMeaningCopyShortcuts } from './hooks/useMeaningCopyShortcuts';
import { useMeaningLookup } from './hooks/useMeaningLookup';
import { useMeaningRomajied } from './hooks/useMeaningRomajied';
import { useMeaningUserNotes } from './hooks/useMeaningUserNotes';
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
}: MeaningBoxProps) => {
  const { speak, stop, speaking, supported } = useSpeech();
  const [selectedVoice] = useStoreData('tts.option.voice', '');

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

  const {
    userNote,
    isGeneratingNote,
    saveNote,
    deleteNote,
    generateNoteWithAI,
  } = useMeaningUserNotes(meaning, lang);

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
          term={meaning}
          lang={lang}
          tokenizeMiteiru={tokenizeMiteiru}
          userNote={userNote}
          onSave={saveNote}
          onDelete={deleteNote}
          onAIGenerate={generateNoteWithAI}
          isGenerating={isGeneratingNote}
          onNavigateToTerm={handleNavigateToTerm}
        />

        <DictionarySection
          characterContent={characterPanel}
          meaningContent={meaningPanel}
        />
      </MeaningBoxShell>
    </>
  );
};

export default MeaningBox;
