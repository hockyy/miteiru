/**
 * Prompts for Learn page grammar AI enrichment.
 * Parsed entries feed useGrammarNotes (user.grammarNotes store).
 */
import { GrammarExample, GrammarUserData } from '../types/jpGrammar';
import { normalizeUserNoteExample } from '../hooks/useUserNotes';

const MAX_EXAMPLES = 3;
const MAX_RELATED = 2;

export interface GrammarPromptContext {
  form: string;
  reading: string;
  meaning: string;
  level: string;
}

export function buildGrammarNoteSystemPrompt(): string {
  return `You are a Japanese grammar tutor. Generate compact study notes for one JLPT grammar point. Respond with JSON only — no markdown, no prose outside the JSON object.

Schema:
{
  "usageNote": "<one concise English sentence on when/how to use this grammar>",
  "funFact": "<optional one short English fun fact, nuance, or context; empty string if nothing useful>",
  "examples": [
    {
      "sentence": "<natural Japanese example sentence using the grammar>",
      "meaning": "<short English translation of that sentence>"
    }
  ],
  "relatedGrammar": ["<1-2 related Japanese grammar patterns or short phrases only>"]
}

Rules:
- "usageNote" must be a single sentence, under 30 words.
- "funFact" is optional — use "" when you have nothing brief and memorable.
- Include 2-${MAX_EXAMPLES} examples; sentences must be Japanese only (no furigana or English in sentence).
- Example "meaning" must be natural English.
- "relatedGrammar" entries must be Japanese grammar labels only — no English.
- Return valid JSON only.`;
}

export function buildGrammarNoteUserPrompt(context: GrammarPromptContext): string {
  return `Generate study notes for this JLPT ${context.level} grammar point.

Form: ${context.form}
Reading: ${context.reading}
Meaning: ${context.meaning}`;
}

export function buildGrammarMoreExamplesSystemPrompt(): string {
  return `You are a Japanese grammar tutor. Add more example sentences for one grammar point. Respond with JSON only.

Schema:
{
  "examples": [
    {
      "sentence": "<natural Japanese example using the grammar>",
      "meaning": "<short English translation>"
    }
  ]
}

Rules:
- Return 1-2 NEW examples not duplicating any provided existing examples.
- Sentences must be Japanese only; meanings in English.
- Return valid JSON only.`;
}

export function buildGrammarMoreExamplesUserPrompt(
  context: GrammarPromptContext,
  existingExamples: { sentence: string; meaning: string }[],
): string {
  const existingBlock =
    existingExamples.length > 0
      ? `\nExisting examples (do not repeat):\n${existingExamples
          .map((example) => `- ${example.sentence} / ${example.meaning}`)
          .join('\n')}`
      : '';

  return `Add more examples for JLPT ${context.level} grammar: ${context.form} (${context.reading}) — ${context.meaning}${existingBlock}`;
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

export const emptyGrammarUserData = (): GrammarUserData => ({
  examples: [],
  usageNote: '',
  funFact: '',
  relatedGrammar: [],
  updatedAt: Date.now(),
});

export const normalizeGrammarUserData = (value: unknown): GrammarUserData => {
  if (!value || typeof value !== 'object') {
    return emptyGrammarUserData();
  }

  const record = value as {
    examples?: unknown;
    usageNote?: unknown;
    funFact?: unknown;
    relatedGrammar?: unknown;
    updatedAt?: unknown;
  };

  return {
    examples: parseExamples(record.examples),
    usageNote: typeof record.usageNote === 'string' ? record.usageNote.trim() : '',
    funFact: typeof record.funFact === 'string' ? record.funFact.trim() : '',
    relatedGrammar: trimStringArray(record.relatedGrammar, MAX_RELATED),
    updatedAt:
      typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
        ? record.updatedAt
        : Date.now(),
  };
};

export const parseGrammarAiResponse = (content: string): GrammarUserData => {
  try {
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
    const noteData = JSON.parse(jsonStr);

    return normalizeGrammarUserData({
      ...noteData,
      updatedAt: Date.now(),
    });
  } catch {
    return {
      ...emptyGrammarUserData(),
      usageNote: content.trim(),
    };
  }
};

export const parseGrammarMoreExamplesResponse = (
  content: string,
): GrammarExample[] => {
  try {
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
    const noteData = JSON.parse(jsonStr);
    return parseExamples(noteData.examples);
  } catch {
    return [];
  }
};
