import { useCallback, useState } from 'react';
import { useAnkiExportConfirm } from '../../../../hooks/useAnkiExportConfirm';
import {
  buildDeckList,
  createAnkiCardsForTerm,
  openAnkiCards,
  safeAnkiFilename,
} from '../../ankiExport';
import type { MeaningContentState, RomajiedGroup } from '../types';
import type { MiteiruUserEntry } from '../../../../hooks/useUserNotes';

type UseMeaningAnkiExportParams = {
  meaning: string;
  lang: string;
  tokenizeMiteiru: (text: string) => Promise<unknown>;
  meaningContent: MeaningContentState;
  romajiedData: RomajiedGroup[];
  rubyHtmlContent: string;
  userNote: MiteiruUserEntry | null;
};

/** Builds Anki cards and opens the export confirmation flow. */
export const useMeaningAnkiExport = ({
  meaning,
  lang,
  tokenizeMiteiru,
  meaningContent,
  romajiedData,
  rubyHtmlContent,
  userNote,
}: UseMeaningAnkiExportParams) => {
  const [isExportingAnki, setIsExportingAnki] = useState(false);
  const { confirmExport, modal: ankiExportModal } = useAnkiExportConfirm();

  const exportToAnki = useCallback(async () => {
    setIsExportingAnki(true);
    try {
      const cards = await createAnkiCardsForTerm({
        term: meaning,
        lang,
        tokenizeMiteiru,
        userNote,
        meaningContent,
        romajiedData,
        rubyHtml: rubyHtmlContent,
      });
      const result = await openAnkiCards(cards, safeAnkiFilename(meaning), confirmExport);

      if (result.canceled) {
        return;
      }

      const deckList = buildDeckList(cards);
      if (result.ankiLaunched) {
        alert(
          `Opened ${cards.length} Anki card${cards.length === 1 ? '' : 's'} (${deckList}).\n\nIn Anki: File → Import → select:\n${result.filePath}`,
        );
      } else if (result.openedFolderOnly) {
        alert(
          `Import file ready (${deckList}).\n\nIts folder was opened — select the file for Anki import:\n${result.filePath}`,
        );
      } else {
        alert(
          `Import file ready (${deckList}).\n\nHighlighted in your file manager. In Anki: File → Import → select:\n${result.filePath}`,
        );
      }
    } catch (error) {
      console.error('Failed to open Anki card:', error);
      alert(`Failed to open Anki card: ${(error as Error).message}`);
    } finally {
      setIsExportingAnki(false);
    }
  }, [
    confirmExport,
    lang,
    meaning,
    meaningContent,
    romajiedData,
    rubyHtmlContent,
    tokenizeMiteiru,
    userNote,
  ]);

  return { isExportingAnki, exportToAnki, ankiExportModal };
};
