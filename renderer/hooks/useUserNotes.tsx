import { useCallback, useEffect, useState } from 'react';

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

export const useUserNotes = () => {
  const [userNotes, setUserNotes] = useState<UserNotesDatabase>({});
  const [isLoading, setIsLoading] = useState(true);

  // Load user notes from electron store
  useEffect(() => {
    const loadNotes = async () => {
      try {
        const notes = await window.electronStore.get('user.notes', {});
        
        // Validate loaded notes structure
        if (typeof notes !== 'object' || notes === null) {
          console.error('Invalid user notes format, resetting to empty');
          setUserNotes({});
          await window.electronStore.set('user.notes', {});
          return;
        }
        
        // Clean up any corrupted entries
        const cleanedNotes: UserNotesDatabase = {};
        for (const [key, value] of Object.entries(notes)) {
          if (value && typeof value === 'object' && 
              ('definition' in value || 'usageNote' in value || 'funFact' in value || 'examples' in value || 'relatedTerms' in value)) {
            cleanedNotes[key] = normalizeUserNoteEntry(value);
          } else {
            console.warn(`Removing corrupted note for term: ${key}`);
          }
        }
        
        setUserNotes(cleanedNotes);
        
        // If we cleaned up entries, save the cleaned version
        if (Object.keys(cleanedNotes).length !== Object.keys(notes).length) {
          await window.electronStore.set('user.notes', cleanedNotes);
        }
      } catch (error) {
        console.error('Failed to load user notes, resetting:', error);
        setUserNotes({});
        try {
          await window.electronStore.set('user.notes', {});
        } catch (e) {
          console.error('Failed to reset user notes store:', e);
        }
      } finally {
        setIsLoading(false);
      }
    };
    loadNotes();
  }, []);

  // Save user notes to electron store
  const saveUserNotes = useCallback(async (notes: UserNotesDatabase) => {
    try {
      await window.electronStore.set('user.notes', notes);
      setUserNotes(notes);
    } catch (error) {
      console.error('Failed to save user notes:', error);
      // Reset to previous state on failure
      const currentNotes = await window.electronStore.get('user.notes', {});
      setUserNotes(currentNotes);
      throw error; // Re-throw so caller knows it failed
    }
  }, []);

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
      setUserNotes(cleanedNotes);
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
