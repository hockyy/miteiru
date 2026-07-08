import { useCallback, useEffect, useState } from 'react';
import {
  GrammarNotesDatabase,
  GrammarUserData,
} from '../types/jpGrammar';
import { normalizeGrammarUserData } from '../utils/aiGrammarPrompts';

const GRAMMAR_NOTES_STORE_KEY = 'user.grammarNotes';

export const useGrammarNotes = () => {
  const [grammarNotes, setGrammarNotes] = useState<GrammarNotesDatabase>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadNotes = async () => {
      try {
        const notes = await window.electronStore.get(GRAMMAR_NOTES_STORE_KEY, {});

        if (typeof notes !== 'object' || notes === null) {
          setGrammarNotes({});
          await window.electronStore.set(GRAMMAR_NOTES_STORE_KEY, {});
          return;
        }

        const cleanedNotes: GrammarNotesDatabase = {};
        for (const [key, value] of Object.entries(notes)) {
          if (value && typeof value === 'object') {
            cleanedNotes[key] = normalizeGrammarUserData(value);
          }
        }

        setGrammarNotes(cleanedNotes);
      } catch (error) {
        console.error('Failed to load grammar notes:', error);
        setGrammarNotes({});
      } finally {
        setIsLoading(false);
      }
    };

    loadNotes();
  }, []);

  const saveGrammarNotes = useCallback(async (notes: GrammarNotesDatabase) => {
    await window.electronStore.set(GRAMMAR_NOTES_STORE_KEY, notes);
    setGrammarNotes(notes);
  }, []);

  const getGrammarNote = useCallback(
    (grammarId: string): GrammarUserData | null => grammarNotes[grammarId] ?? null,
    [grammarNotes],
  );

  const setGrammarNote = useCallback(
    async (grammarId: string, entry: GrammarUserData) => {
      const normalized = normalizeGrammarUserData({
        ...entry,
        updatedAt: Date.now(),
      });
      const newNotes = { ...grammarNotes, [grammarId]: normalized };
      await saveGrammarNotes(newNotes);
    },
    [grammarNotes, saveGrammarNotes],
  );

  const deleteGrammarNote = useCallback(
    async (grammarId: string) => {
      const newNotes = { ...grammarNotes };
      delete newNotes[grammarId];
      await saveGrammarNotes(newNotes);
    },
    [grammarNotes, saveGrammarNotes],
  );

  return {
    grammarNotes,
    isLoading,
    getGrammarNote,
    setGrammarNote,
    deleteGrammarNote,
  };
};
