import { useCallback, useState } from 'react';
import { useStoreData } from '../../../../hooks/useStoreData';
import { generateUserNoteWithAI } from '../../../../utils/generateUserNoteWithAI';
import type { MiteiruUserEntry } from '../../../../hooks/useUserNotes';

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
  const [openRouterApiKey] = useStoreData('openrouter.apiKey', '');
  const [openRouterModel] = useStoreData('openrouter.model', 'z-ai/glm-5.2:nitro');

  const saveNote = useCallback(
    async (entry: MiteiruUserEntry) => {
      try {
        await setUserNote(meaning, entry);
      } catch (error) {
        console.error('Failed to save user note:', error);
        alert('Failed to save note. The note has been removed. Please try again.');
      }
    },
    [meaning, setUserNote],
  );

  const deleteNote = useCallback(async () => {
    try {
      await deleteUserNote(meaning);
    } catch (error) {
      console.error('Failed to delete user note:', error);
      alert('Failed to delete note. Please try again.');
    }
  }, [deleteUserNote, meaning]);

  const generateNoteWithAI = useCallback(async () => {
    if (!openRouterApiKey) {
      alert('Please set your OpenRouter API key in settings (Ctrl+X)');
      return;
    }

    setIsGeneratingNote(true);
    try {
      await setUserNote(meaning, await generateUserNoteWithAI({
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
  }, [lang, meaning, openRouterApiKey, openRouterModel, setUserNote]);

  return {
    userNote: getUserNote(meaning),
    isGeneratingNote,
    saveNote,
    deleteNote,
    generateNoteWithAI,
  };
};
