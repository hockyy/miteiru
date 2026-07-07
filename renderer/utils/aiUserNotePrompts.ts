/**
 * Prompts for MeaningBox "My Notes" AI generation.
 * Parsed entries feed UserNotesSection and term Anki export (ankiExport.ts).
 */
import {MiteiruUserEntry, normalizeUserNoteEntry, normalizeUserNoteExample} from '../hooks/useUserNotes';
import {getLanguageDisplayName} from '../languages/manifest';

const MAX_EXAMPLES = 2;
const MAX_RELATED_TERMS = 2;

export function buildUserNoteSystemPrompt(lang: string): string {
  const languageName = getLanguageDisplayName(lang);

  return `You are a ${languageName} vocabulary tutor. Generate compact personal study notes for one word. Respond with JSON only — no markdown, no prose outside the JSON object.

Schema:
{
  "definition": "<one short English gloss, under 12 words, no full sentence>",
  "usageNote": "<one concise English sentence on when/how to use the word>",
  "funFact": "<optional one short English fun fact, etymology, or cultural note; empty string if nothing interesting>",
  "examples": [
    {
      "sentence": "<natural ${languageName} example sentence using the word>",
      "meaning": "<short English translation of that sentence>"
    }
  ],
  "relatedTerms": ["<1-2 related ${languageName} words or short phrases only>"]
}

Rules:
- "definition" is for flashcards: brief English meaning only.
- "usageNote" must be a single sentence, under 25 words.
- "funFact" is optional — omit interesting trivia only when you have something brief and memorable; otherwise use "".
- Include at most ${MAX_EXAMPLES} examples and ${MAX_RELATED_TERMS} related terms.
- Example "sentence" must be in ${languageName} native script only — no English, pinyin, or furigana.
- Example "meaning" must be natural English.
- Related terms must be in ${languageName} only — no English or romanization.
- Return valid JSON only.`;
}

export function buildUserNoteUserPrompt(term: string, lang: string): string {
  const languageName = getLanguageDisplayName(lang);
  return `Generate study notes for the ${languageName} word: "${term}"`;
}

const trimStringArray = (values: unknown, maxItems: number): string[] => {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)
    .slice(0, maxItems);
};

const parseExamples = (values: unknown) => {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => normalizeUserNoteExample(value))
    .filter((example): example is NonNullable<typeof example> => Boolean(example?.sentence?.trim()))
    .slice(0, MAX_EXAMPLES);
};

export const parseUserNoteAiResponse = (content: string): MiteiruUserEntry => {
  try {
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
    const noteData = JSON.parse(jsonStr);

    return normalizeUserNoteEntry({
      definition: noteData.definition,
      usageNote: noteData.usageNote,
      funFact: noteData.funFact,
      examples: parseExamples(noteData.examples),
      relatedTerms: trimStringArray(noteData.relatedTerms, MAX_RELATED_TERMS),
    });
  } catch {
    return {
      definition: '',
      usageNote: content.trim(),
      funFact: '',
      examples: [],
      relatedTerms: [],
    };
  }
};

export const emptyUserNote = (): MiteiruUserEntry => ({
  definition: '',
  usageNote: '',
  funFact: '',
  examples: [],
  relatedTerms: [],
});
