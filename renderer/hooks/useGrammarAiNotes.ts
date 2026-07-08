import { useCallback, useState } from 'react';
import { GrammarStudyEntry, GrammarUserData } from '../types/jpGrammar';
import {
  buildGrammarMoreExamplesSystemPrompt,
  buildGrammarMoreExamplesUserPrompt,
  buildGrammarNoteSystemPrompt,
  buildGrammarNoteUserPrompt,
  emptyGrammarUserData,
  normalizeGrammarUserData,
  parseGrammarAiResponse,
  parseGrammarMoreExamplesResponse,
} from '../utils/aiGrammarPrompts';
import { openRouterMessages, streamOpenRouterCompletion } from '../utils/openRouterClient';

interface UseGrammarAiNotesOptions {
  openRouterApiKey: string;
  openRouterModel: string;
  getGrammarNote: (grammarId: string) => GrammarUserData | null;
  setGrammarNote: (grammarId: string, entry: GrammarUserData) => Promise<void>;
  deleteGrammarNote: (grammarId: string) => Promise<void>;
}

export function useGrammarAiNotes({
  openRouterApiKey,
  openRouterModel,
  getGrammarNote,
  setGrammarNote,
  deleteGrammarNote,
}: UseGrammarAiNotesOptions) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAddingExamples, setIsAddingExamples] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const generateNotes = useCallback(
    async (entry: GrammarStudyEntry) => {
      if (!openRouterApiKey.trim()) {
        setErrorMessage(openRouterMessages.missingApiKey);
        return null;
      }

      if (!openRouterModel.trim()) {
        setErrorMessage(openRouterMessages.missingModel);
        return null;
      }

      setIsGenerating(true);
      setErrorMessage(null);

      try {
        const rawResponse = await streamOpenRouterCompletion(
          openRouterApiKey,
          openRouterModel,
          [
            { role: 'system', content: buildGrammarNoteSystemPrompt() },
            {
              role: 'user',
              content: buildGrammarNoteUserPrompt({
                form: entry.form,
                reading: entry.reading,
                meaning: entry.meaning,
                level: entry.level,
              }),
            },
          ],
        );

        const parsed = parseGrammarAiResponse(rawResponse);
        await setGrammarNote(entry.id, parsed);
        return parsed;
      } catch (error) {
        console.error('Grammar note generation failed:', error);
        setErrorMessage(`Failed to generate notes: ${(error as Error).message}`);
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    [openRouterApiKey, openRouterModel, setGrammarNote],
  );

  const addMoreExamples = useCallback(
    async (entry: GrammarStudyEntry) => {
      if (!openRouterApiKey.trim()) {
        setErrorMessage(openRouterMessages.missingApiKey);
        return null;
      }

      if (!openRouterModel.trim()) {
        setErrorMessage(openRouterMessages.missingModel);
        return null;
      }

      const existing = getGrammarNote(entry.id) ?? emptyGrammarUserData();

      setIsAddingExamples(true);
      setErrorMessage(null);

      try {
        const rawResponse = await streamOpenRouterCompletion(
          openRouterApiKey,
          openRouterModel,
          [
            { role: 'system', content: buildGrammarMoreExamplesSystemPrompt() },
            {
              role: 'user',
              content: buildGrammarMoreExamplesUserPrompt(
                {
                  form: entry.form,
                  reading: entry.reading,
                  meaning: entry.meaning,
                  level: entry.level,
                },
                existing.examples,
              ),
            },
          ],
        );

        const newExamples = parseGrammarMoreExamplesResponse(rawResponse);
        if (newExamples.length === 0) {
          setErrorMessage('Could not parse new examples. Try again.');
          return null;
        }

        const merged = normalizeGrammarUserData({
          ...existing,
          examples: [...existing.examples, ...newExamples],
          updatedAt: Date.now(),
        });
        await setGrammarNote(entry.id, merged);
        return merged;
      } catch (error) {
        console.error('Grammar example generation failed:', error);
        setErrorMessage(`Failed to add examples: ${(error as Error).message}`);
        return null;
      } finally {
        setIsAddingExamples(false);
      }
    },
    [getGrammarNote, openRouterApiKey, openRouterModel, setGrammarNote],
  );

  const clearNotes = useCallback(
    async (grammarId: string) => {
      try {
        await deleteGrammarNote(grammarId);
      } catch (error) {
        console.error('Failed to clear grammar notes:', error);
        setErrorMessage('Failed to clear saved notes.');
      }
    },
    [deleteGrammarNote],
  );

  const clearError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  return {
    isGenerating,
    isAddingExamples,
    errorMessage,
    generateNotes,
    addMoreExamples,
    clearNotes,
    clearError,
  };
}

export type { GrammarUserData };
