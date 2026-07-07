/**
 * Learn-page sentence → Anki Hard deck builder state.
 * Ruby from local tokenizer; translation/note from OpenRouter.
 * UI: components/Learn/AnkiCardBuilderPanel.tsx
 */
import { useCallback, useState } from 'react';
import {
  createInitialSentenceAnkiDraft,
  createSentenceAnkiCardFromDraft,
  openAnkiCards,
  safeAnkiSentenceFilename,
} from '../components/Meaning/ankiExport';
import { useAnkiExportConfirm } from './useAnkiExportConfirm';
import { SentenceAnkiDraft } from '../types/sentenceAnki';
import {
  buildSentenceAnkiSystemPrompt,
  buildSentenceAnkiUserPrompt,
} from '../utils/aiAnkiPrompts';
import { openRouterMessages, streamOpenRouterCompletion } from '../utils/openRouterClient';
import { parseSentenceAnkiBack } from '../utils/parseSentenceAnkiBack';
import { getSentenceRubyData } from '../utils/sentenceRuby';

interface UseSentenceAnkiOptions {
  openRouterApiKey: string;
  openRouterModel: string;
  lang: string;
  tokenizeMiteiru?: (text: string) => Promise<unknown[]>;
}

export function useSentenceAnki({
  openRouterApiKey,
  openRouterModel,
  lang,
  tokenizeMiteiru,
}: UseSentenceAnkiOptions) {
  const [draft, setDraft] = useState<SentenceAnkiDraft | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [openStatusMessage, setOpenStatusMessage] = useState<string | null>(null);
  const { confirmExport, modal: ankiExportModal } = useAnkiExportConfirm();

  const clearAnkiCard = useCallback(() => {
    setDraft(null);
    setErrorMessage(null);
    setOpenStatusMessage(null);
  }, []);

  const updateDraft = useCallback((updates: Partial<SentenceAnkiDraft>) => {
    setDraft((current) => (current ? { ...current, ...updates } : current));
  }, []);

  const buildAnkiCard = useCallback(async (sentence: string) => {
    const trimmed = sentence.trim();

    if (!trimmed) {
      setDraft(null);
      setErrorMessage('Please enter a sentence first.');
      return;
    }

    if (!openRouterApiKey.trim()) {
      setDraft(null);
      setErrorMessage(openRouterMessages.missingApiKey);
      return;
    }

    if (!tokenizeMiteiru) {
      setDraft(null);
      setErrorMessage('Tokenizer is not ready yet. Wait a moment and try again.');
      return;
    }

    setIsBuilding(true);
    setDraft(null);
    setErrorMessage(null);

    try {
      const [{ rubyHtml }, rawResponse] = await Promise.all([
        getSentenceRubyData(trimmed, tokenizeMiteiru),
        streamOpenRouterCompletion(openRouterApiKey, openRouterModel, [
          { role: 'system', content: buildSentenceAnkiSystemPrompt(lang) },
          { role: 'user', content: buildSentenceAnkiUserPrompt(trimmed, lang) },
        ]),
      ]);

      const parsedBack = parseSentenceAnkiBack(rawResponse);
      if (!parsedBack) {
        setErrorMessage('Could not parse AI card content. Try again.');
        return;
      }

      setDraft(createInitialSentenceAnkiDraft({
        sourceSentence: trimmed,
        lang,
        rubyHtml,
        translation: parsedBack.translation,
        note: parsedBack.note,
      }));
    } catch (error) {
      console.error('Anki card build failed:', error);
      setErrorMessage(`Card build failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsBuilding(false);
    }
  }, [lang, openRouterApiKey, openRouterModel, tokenizeMiteiru]);

  const openAnkiCard = useCallback(async () => {
    if (!draft) {
      return false;
    }

    if (!draft.frontText.trim()) {
      setErrorMessage('Front side cannot be empty.');
      return false;
    }

    setIsOpening(true);
    setErrorMessage(null);
    setOpenStatusMessage(null);

    try {
      const card = createSentenceAnkiCardFromDraft(draft);
      const result = await openAnkiCards(
        [card],
        safeAnkiSentenceFilename(draft.sourceSentence),
        confirmExport,
      );

      if (result.canceled) {
        return false;
      }

      if (result.ankiLaunched) {
        setOpenStatusMessage(
          `Import file ready. Anki was opened — use File → Import and select:\n${result.filePath}`,
        );
      } else if (result.openedFolderOnly) {
        setOpenStatusMessage(
          `Import file saved. Its folder was opened — select the file for Anki import:\n${result.filePath}`,
        );
      } else {
        setOpenStatusMessage(
          `Import file highlighted in your file manager. In Anki: File → Import → select:\n${result.filePath}`,
        );
      }

      return true;
    } catch (error) {
      console.error('Anki open failed:', error);
      setErrorMessage(`Could not open Anki import file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    } finally {
      setIsOpening(false);
    }
  }, [confirmExport, draft]);

  const hasAnkiBuilderPanel = isBuilding || !!draft || !!errorMessage;

  return {
    draft,
    errorMessage,
    isBuilding,
    isOpening,
    openStatusMessage,
    hasAnkiBuilderPanel,
    ankiExportModal,
    buildAnkiCard,
    updateDraft,
    openAnkiCard,
    clearAnkiCard,
  };
};
