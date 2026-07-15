import { useCallback, useState } from 'react';
import { useStoreData } from '../../../../hooks/useStoreData';
import { generateUserNoteWithAI } from '../../../../utils/generateUserNoteWithAI';
import {
  getUserNoteKey,
  type MiteiruUserEntry,
} from '../../../../hooks/useUserNotes';

export type UserNotesApi = Pick<
  ReturnType<typeof import("../../../../hooks/useUserNotes").useUserNotes>,
  "getUserNote" | "setUserNote" | "deleteUserNote" | "userNotes"
>;

/** CRUD + OpenRouter AI generation for the My Notes panel. */
export const useMeaningUserNotes = (
  meaning: string,
  lang: string,
  notesApi: UserNotesApi,
) => {
  const [isGeneratingNote, setIsGeneratingNote] = useState(false);
  const { getUserNote, setUserNote, deleteUserNote } = notesApi;
  const noteKey = getUserNoteKey(meaning, lang);
  const localizedNote = getUserNote(noteKey);
  const userNote = localizedNote ?? getUserNote(meaning);
  const [openRouterApiKey] = useStoreData('openrouter.apiKey', '');
  const [openRouterModel] = useStoreData('openrouter.model', 'z-ai/glm-5.2:nitro');

  const saveNote = useCallback(
    async (entry: MiteiruUserEntry) => {
      try {
        await setUserNote(noteKey, entry);
      } catch (error) {
        console.error('Failed to save user note:', error);
        alert('Failed to save note. The note has been removed. Please try again.');
      }
    },
    [noteKey, setUserNote],
  );

  const deleteNote = useCallback(async () => {
    try {
      await deleteUserNote(localizedNote ? noteKey : meaning);
    } catch (error) {
      console.error('Failed to delete user note:', error);
      alert('Failed to delete note. Please try again.');
    }
  }, [deleteUserNote, localizedNote, meaning, noteKey]);

  const generateNoteWithAI = useCallback(async () => {
    if (!openRouterApiKey) {
      alert('Please set your OpenRouter API key in settings (Ctrl+X)');
      return;
    }

    setIsGeneratingNote(true);
    try {
      await setUserNote(noteKey, await generateUserNoteWithAI({
        term: meaning,
        lang,
        openRouterApiKey,
        openRouterModel,
      }));
    } catch (error) {
      console.error('AI note generation failed:', error);
      alert(`Failed to generate note: ${(error as Error).message}`);
    } finally {
      setIsGeneratingNote(false);
    }
  }, [lang, meaning, noteKey, openRouterApiKey, openRouterModel, setUserNote]);

  return {
    noteKey,
    userNote,
    isGeneratingNote,
    saveNote,
    deleteNote,
    generateNoteWithAI,
  };
};
