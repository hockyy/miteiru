import { useCallback, useState } from 'react';
import type { ToastInfo } from '../../../VideoPlayer/Toast';
import { ankiSavedMessage } from '../../../../utils/ankiNotice';
import { useAnkiExportConfirm } from '../../../../hooks/useAnkiExportConfirm';
import {
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
  userNote: MiteiruUserEntry | null;
};

/** Builds Anki cards and opens the export confirmation flow. */
export const useMeaningAnkiExport = ({
  meaning,
  lang,
  tokenizeMiteiru,
  meaningContent,
  romajiedData,
  userNote,
}: UseMeaningAnkiExportParams) => {
  const [isExportingAnki, setIsExportingAnki] = useState(false);
  const { confirmExport, modal: ankiExportModal } = useAnkiExportConfirm();
  // The result shows in a toast with a button, not a native alert.
  const [notice, showNotice] = useState<ToastInfo>({ message: '' });

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
      });
      const result = await openAnkiCards(cards, safeAnkiFilename(meaning), confirmExport);

      if (result.canceled) {
        return;
      }

      // The file is saved (and, where possible, shown in the file manager); say where it is and what to do next.
      showNotice({
        message: ankiSavedMessage(result.filePath),
        update: String(Date.now()),
        duration: 15000,
        action: {label: 'Show in folder', onPress: () => window.electronAPI.showItemInFolder(result.filePath)},
      });
    } catch (error) {
      console.error('Failed to open Anki card:', error);
      showNotice({message: `Could not export to Anki: ${(error as Error).message}`, update: String(Date.now()), error: true});
    } finally {
      setIsExportingAnki(false);
    }
  }, [
    confirmExport,
    lang,
    meaning,
    meaningContent,
    romajiedData,
    tokenizeMiteiru,
    userNote,
  ]);

  return { isExportingAnki, exportToAnki, ankiExportModal, ankiNotice: notice };
};
