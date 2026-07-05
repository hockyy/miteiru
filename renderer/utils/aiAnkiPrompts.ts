/**
 * Prompts for Learn-page sentence → Anki Hard deck back content.
 * Ruby on the card back comes from the local tokenizer; AI supplies translation + note.
 * Parser: utils/parseSentenceAnkiBack.ts | Hook: hooks/useSentenceAnki.ts
 */
import { getLanguageDisplayName } from '../languages/manifest';

export function buildSentenceAnkiSystemPrompt(lang: string): string {
  const languageName = getLanguageDisplayName(lang);

  return `You are a ${languageName} language learning assistant. Help build the back of an Anki flashcard for one sentence. Respond with JSON only — no markdown, no prose outside the JSON object.

Schema:
{
  "translation": "<natural English translation of the sentence>",
  "note": "<optional 1-2 short English sentences: grammar, nuance, or usage tip; empty string if nothing useful>"
}

Rules:
- Keep "translation" concise and natural.
- "note" should highlight one thing that helps recall the sentence, not a full lecture.
- Do not include ruby HTML or readings — those are added separately.
- Return valid JSON only.`;
}

export function buildSentenceAnkiUserPrompt(sentence: string, lang: string): string {
  const languageName = getLanguageDisplayName(lang);
  return `Create Anki back content for this ${languageName} sentence: "${sentence}"`;
}
