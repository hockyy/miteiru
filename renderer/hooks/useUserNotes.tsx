import { useCallback, useEffect, useRef } from 'react';
import { useStoreData } from './useStoreData';

export interface UserNoteExample {
  sentence: string;
  meaning: string;
}

export interface MiteiruUserEntry {
  /** Short English gloss — primary definition for Anki when set */
  definition: string;
  examples: UserNoteExample[];
  usageNote: string;
  /** Optional short trivia for study / Anki */
  funFact: string;
  relatedTerms: string[];
}

export interface UserNotesDatabase {
  [term: string]: MiteiruUserEntry;
}

export const normalizeUserNoteExample = (value: unknown): UserNoteExample | null => {
  if (typeof value === 'string') {
    const sentence = value.trim();
    return sentence ? { sentence, meaning: '' } : null;
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as { sentence?: unknown; text?: unknown; meaning?: unknown };
  const sentence = typeof record.sentence === 'string'
    ? record.sentence.trim()
    : typeof record.text === 'string'
      ? record.text.trim()
      : '';
  const meaning = typeof record.meaning === 'string' ? record.meaning.trim() : '';

  return sentence || meaning ? { sentence, meaning } : null;
};

export const normalizeUserNoteEntry = (value: unknown): MiteiruUserEntry => {
  if (!value || typeof value !== 'object') {
    return {
      definition: '',
      usageNote: '',
      funFact: '',
      examples: [],
      relatedTerms: [],
    };
  }

  const record = value as {
    definition?: unknown;
    usageNote?: unknown;
    funFact?: unknown;
    examples?: unknown;
    relatedTerms?: unknown;
  };

  const examples = Array.isArray(record.examples)
    ? record.examples
      .map((example) => normalizeUserNoteExample(example))
      .filter((example): example is UserNoteExample => Boolean(example?.sentence?.trim()))
    : [];

  const relatedTerms = Array.isArray(record.relatedTerms)
    ? record.relatedTerms
      .map((term) => (typeof term === 'string' ? term.trim() : ''))
      .filter(Boolean)
    : [];

  return {
    definition: typeof record.definition === 'string' ? record.definition.trim() : '',
    usageNote: typeof record.usageNote === 'string' ? record.usageNote.trim() : '',
    funFact: typeof record.funFact === 'string' ? record.funFact.trim() : '',
    examples,
    relatedTerms,
  };
};

/** True when a saved note has any exportable study content. */
export const hasUserNoteContent = (entry: MiteiruUserEntry | null | undefined): boolean => {
  if (!entry) {
    return false;
  }
  return Boolean(
    entry.definition?.trim()
    || entry.usageNote?.trim()
    || entry.funFact?.trim()
    || entry.examples?.length
    || entry.relatedTerms?.length,
  );
};

export const useUserNotes = () => {
  const [userNotes, setUserNotesRaw, isLoaded] = useStoreData<UserNotesDatabase>('user.notes', {});
  const hasCleanedRef = useRef(false);
  const isLoading = !isLoaded;

  // Normalize once after the shared store loads (first subscriber wins).
  useEffect(() => {
    if (!isLoaded || hasCleanedRef.current) {
      return;
    }
    hasCleanedRef.current = true;

    if (typeof userNotes !== 'object' || userNotes === null) {
      console.error('Invalid user notes format, resetting to empty');
      void setUserNotesRaw({});
      return;
    }

    const cleanedNotes: UserNotesDatabase = {};
    let removedCorrupted = false;

    for (const [key, value] of Object.entries(userNotes)) {
      if (
        value
        && typeof value === 'object'
        && ('definition' in value
          || 'usageNote' in value
          || 'funFact' in value
          || 'examples' in value
          || 'relatedTerms' in value)
      ) {
        cleanedNotes[key] = normalizeUserNoteEntry(value);
      } else {
        console.warn(`Removing corrupted note for term: ${key}`);
        removedCorrupted = true;
      }
    }

    if (removedCorrupted || Object.keys(cleanedNotes).length !== Object.keys(userNotes).length) {
      void setUserNotesRaw(cleanedNotes);
    }
  }, [isLoaded, setUserNotesRaw, userNotes]);

  const saveUserNotes = useCallback(async (notes: UserNotesDatabase) => {
    await setUserNotesRaw(notes);
  }, [setUserNotesRaw]);

  // Get note for a specific term
  const getUserNote = useCallback((term: string): MiteiruUserEntry | null => {
    return userNotes[term] || null;
  }, [userNotes]);

  // Set note for a specific term
  const setUserNote = useCallback(async (term: string, entry: MiteiruUserEntry) => {
    try {
      const newNotes = { ...userNotes, [term]: normalizeUserNoteEntry(entry) };
      await saveUserNotes(newNotes);
    } catch (error) {
      console.error('Failed to set user note, removing it:', error);
      // If save fails, remove the note immediately
      const cleanedNotes = { ...userNotes };
      delete cleanedNotes[term];
      await setUserNotesRaw(cleanedNotes);
      throw error; // Re-throw so caller knows it failed
    }
  }, [userNotes, saveUserNotes]);

  // Delete note for a specific term
  const deleteUserNote = useCallback(async (term: string) => {
    try {
      const newNotes = { ...userNotes };
      delete newNotes[term];
      await saveUserNotes(newNotes);
    } catch (error) {
      console.error('Failed to delete user note:', error);
      throw error; // Re-throw so caller knows it failed
    }
  }, [userNotes, saveUserNotes]);

  // Check if a term has a note
  const hasUserNote = useCallback((term: string): boolean => {
    return term in userNotes;
  }, [userNotes]);

  return {
    userNotes,
    isLoading,
    getUserNote,
    setUserNote,
    deleteUserNote,
    hasUserNote,
  };
};
