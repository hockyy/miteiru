import { useCallback, useEffect, useState } from "react";
import type { InflectionRow, InflectionTable } from "../../../../../main/handler/languages/inflectionTypes";
import type { MiteiruUserEntry, UserNoteExample } from "../../../../hooks/useUserNotes";
import {
  buildInflectionExamplesSystemPrompt,
  buildInflectionExamplesUserPrompt,
  filterInflectionExamples,
  flattenInflectionRows,
  isInflectionExample,
  parseInflectionExamplesResponse,
} from "../../../../utils/aiInflectionPrompts";
import { emptyUserNote } from "../../../../utils/aiUserNotePrompts";
import { openRouterMessages, streamOpenRouterCompletion } from "../../../../utils/openRouterClient";

const mergeInflectionExamples = (
  existing: UserNoteExample[],
  incoming: UserNoteExample[],
): UserNoteExample[] => {
  const withoutInflection = existing.filter((example) => !isInflectionExample(example.meaning));
  const seen = new Set(withoutInflection.map((example) => example.sentence));
  const merged = [...withoutInflection];

  for (const example of incoming) {
    if (seen.has(example.sentence)) {
      continue;
    }
    seen.add(example.sentence);
    merged.push(example);
  }

  return merged;
};

export const useMeaningInflectionAi = ({
  openRouterApiKey,
  openRouterModel,
  noteTerm,
  getUserNote,
  setUserNote,
  userNotes,
}: {
  openRouterApiKey: string;
  openRouterModel: string;
  noteTerm: string;
  getUserNote: (term: string) => MiteiruUserEntry | null;
  setUserNote: (term: string, entry: MiteiruUserEntry) => Promise<void>;
  userNotes: Record<string, MiteiruUserEntry>;
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [inflectionExamples, setInflectionExamples] = useState<UserNoteExample[]>([]);

  useEffect(() => {
    setInflectionExamples(filterInflectionExamples(getUserNote(noteTerm)?.examples ?? []));
  }, [getUserNote, noteTerm, userNotes]);

  const generateExamples = useCallback(
    async (table: InflectionTable, rows: InflectionRow[], wordMeaning: string) => {
      if (!openRouterApiKey.trim()) {
        setErrorMessage(openRouterMessages.missingApiKey);
        return null;
      }

      if (!openRouterModel.trim()) {
        setErrorMessage(openRouterMessages.missingModel);
        return null;
      }

      const forms = flattenInflectionRows(rows);
      if (!forms.length) {
        return null;
      }

      setIsGenerating(true);
      setErrorMessage(null);

      try {
        const rawResponse = await streamOpenRouterCompletion(
          openRouterApiKey,
          openRouterModel,
          [
            { role: "system", content: buildInflectionExamplesSystemPrompt() },
            {
              role: "user",
              content: buildInflectionExamplesUserPrompt(
                table.dictionaryForm,
                wordMeaning,
                table.kind,
                forms,
              ),
            },
          ],
        );

        const incoming = parseInflectionExamplesResponse(rawResponse, forms, wordMeaning);
        if (!incoming.length) {
          setErrorMessage("Could not parse inflection examples. Try again.");
          return null;
        }

        const existing = getUserNote(noteTerm) ?? emptyUserNote();
        const mergedExamples = mergeInflectionExamples(existing.examples, incoming);

        await setUserNote(noteTerm, {
          ...existing,
          examples: mergedExamples,
        });

        const nextInflectionExamples = filterInflectionExamples(mergedExamples);
        setInflectionExamples(nextInflectionExamples);
        return nextInflectionExamples;
      } catch (error) {
        console.error("Inflection example generation failed:", error);
        setErrorMessage(`Failed to generate examples: ${(error as Error).message}`);
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    [getUserNote, noteTerm, openRouterApiKey, openRouterModel, setUserNote],
  );

  const clearError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  return {
    inflectionExamples,
    isGenerating,
    errorMessage,
    generateExamples,
    clearError,
  };
};
