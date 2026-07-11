import { useCallback } from 'react';
import { collectGrammarAnkiCards } from '../components/Meaning/grammarAnkiExport';
import {
  buildDeckList,
  createAnkiCardsForTerm,
  hasAnkiNoteContent,
  safeAnkiAllFilename,
  saveAnkiCards,
} from '../components/Meaning/ankiExport';
import { languageCodes } from '../languages/manifest';
import { fetchJpGrammarCatalog } from '../utils/jpGrammarCatalog';
import { loadGrammarNotesFromStore } from './useGrammarNotes';
import { useAnkiExportConfirm } from './useAnkiExportConfirm';
import { useUserNotes } from './useUserNotes';

type UseExportAllAnkiCardsParams = {
  lang: string;
  tokenizeMiteiru: (text: string) => Promise<unknown>;
};

/** Bulk export My Notes vocabulary + grammar cards to a single Anki TSV. */
export const useExportAllAnkiCards = ({ lang, tokenizeMiteiru }: UseExportAllAnkiCardsParams) => {
  const { userNotes } = useUserNotes();
  const { confirmExport, modal: ankiExportModal } = useAnkiExportConfirm();

  const exportAllAnkiCards = useCallback(async () => {
    try {
      if (!lang) {
        alert('Please select a language before exporting Anki cards.');
        return;
      }

      const learningState = await window.ipc.invoke('loadLearningState', lang);
      const terms = Object.keys(learningState || {}).filter(Boolean);

      const cards = [];
      let notesTermCount = 0;

      for (const term of terms) {
        const userNote = userNotes[term] || null;
        if (!hasAnkiNoteContent(userNote)) {
          continue;
        }
        notesTermCount += 1;
        cards.push(...await createAnkiCardsForTerm({
          term,
          lang,
          tokenizeMiteiru,
          userNote,
        }));
      }

      let grammarPointCount = 0;
      if (lang === languageCodes.japanese) {
        const [catalog, grammarNotes] = await Promise.all([
          fetchJpGrammarCatalog(),
          loadGrammarNotesFromStore(),
        ]);
        const grammarCards = collectGrammarAnkiCards(catalog.entries, grammarNotes, lang);
        grammarPointCount = grammarCards.length / 2;
        cards.push(...grammarCards);
      }

      if (cards.length === 0) {
        alert('No saved My Notes or grammar notes found for this language.');
        return;
      }

      const saved = await saveAnkiCards(cards, safeAnkiAllFilename(lang), confirmExport);
      if (saved) {
        const notesSummary = notesTermCount > 0
          ? `${notesTermCount} noted vocabulary term${notesTermCount !== 1 ? 's' : ''}`
          : '';
        const grammarSummary = grammarPointCount > 0
          ? `${grammarPointCount} grammar point${grammarPointCount !== 1 ? 's' : ''}`
          : '';
        const sourceSummary = [notesSummary, grammarSummary].filter(Boolean).join(' and ');
        alert(`Saved ${cards.length} Anki cards from ${sourceSummary} for ${buildDeckList(cards)}.`);
      }
    } catch (error) {
      console.error('Failed to export all Anki cards:', error);
      alert(`Failed to export all Anki cards: ${(error as Error).message}`);
    }
  }, [confirmExport, lang, tokenizeMiteiru, userNotes]);

  return { exportAllAnkiCards, ankiExportModal };
};
