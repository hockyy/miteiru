import { useCallback, useState } from 'react';
import { useStoreData } from '../../../../hooks/useStoreData';
import { useUserNotes } from '../../../../hooks/useUserNotes';
import {
  buildUserNoteSystemPrompt,
  buildUserNoteUserPrompt,
  parseUserNoteAiResponse,
} from '../../../../utils/aiUserNotePrompts';
import type { MiteiruUserEntry } from '../../../../hooks/useUserNotes';

/** CRUD + OpenRouter AI generation for the My Notes panel. */
export const useMeaningUserNotes = (meaning: string, lang: string) => {
  const [isGeneratingNote, setIsGeneratingNote] = useState(false);
  const { getUserNote, setUserNote, deleteUserNote } = useUserNotes();
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
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openRouterApiKey}`,
          'HTTP-Referer': 'https://github.com/hockyy/miteiru',
          'X-Title': 'Miteiru',
        },
        body: JSON.stringify({
          model: openRouterModel,
          messages: [
            { role: 'system', content: buildUserNoteSystemPrompt(lang) },
            { role: 'user', content: buildUserNoteUserPrompt(meaning, lang) },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      await setUserNote(meaning, parseUserNoteAiResponse(content));
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
