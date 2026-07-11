import type { MiteiruUserEntry } from '../../hooks/useUserNotes';

const truncate = (text: string, maxLength: number) => {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
};

export type VocabNotePreview = {
  definition: string;
  usageNote: string;
  funFact: string;
  exampleCount: number;
};

export const getVocabNotePreview = (entry: MiteiruUserEntry | null | undefined): VocabNotePreview | null => {
  if (!entry) {
    return null;
  }

  const definition = entry.definition?.trim() || '';
  const usageNote = entry.usageNote?.trim() || '';
  const funFact = entry.funFact?.trim() || '';
  const exampleCount = entry.examples?.length ?? 0;

  if (!definition && !usageNote && !funFact && exampleCount === 0) {
    return null;
  }

  return {
    definition: truncate(definition, 72),
    usageNote: truncate(usageNote, 96),
    funFact: truncate(funFact, 72),
    exampleCount,
  };
};
