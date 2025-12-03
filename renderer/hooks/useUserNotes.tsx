import { useCallback, useEffect, useState } from 'react';

export interface MiteiruUserEntry {
  examples: string[];
  usageNote: string;
  relatedTerms: string[];
}

export interface UserNotesDatabase {
  [term: string]: MiteiruUserEntry;
}

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
        const cleanedNotes = {};
        for (const [key, value] of Object.entries(notes)) {
          if (value && typeof value === 'object' && 
              ('usageNote' in value || 'examples' in value || 'relatedTerms' in value)) {
            cleanedNotes[key] = value;
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
      const newNotes = { ...userNotes, [term]: entry };
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

