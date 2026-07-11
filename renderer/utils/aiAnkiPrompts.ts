/**
 * Prompts for Learn-page sentence → Anki Sentence deck content.
 * AI returns translation, note, and ruby segments; Miteiru builds ruby HTML locally.
 * Parser: utils/parseSentenceAnkiBack.ts | Hook: hooks/useSentenceAnki.ts
 */
import { getLanguageDisplayName } from '../languages/manifest';

export function buildSentenceAnkiSystemPrompt(lang: string): string {
  const languageName = getLanguageDisplayName(lang);

  return `You are a ${languageName} language learning assistant. Help build an Anki flashcard for one sentence. Respond with JSON only — no markdown, no prose outside the JSON object.

Schema:
{
  "translation": "<natural English translation of the sentence>",
  "note": "<optional 1-2 short English sentences: grammar, nuance, or usage tip; empty string if nothing useful>",
  "ruby": [
    { "text": "<exact consecutive substring from the sentence>", "reading": "<hiragana reading for that substring in this sentence, or empty string for kana/punctuation>" }
  ]
}

Rules:
- Keep "translation" concise and natural.
- "note" should highlight one thing that helps recall the sentence, not a full lecture.
- "ruby" must split the original sentence in order; concatenating every "text" must reproduce the exact original sentence.
- Use the reading that is natural in this sentence context (e.g. 明後日 → あさって, not みょうごにち).
- Prefer hiragana in "reading". Leave "reading" empty for plain kana, Latin, numbers, and punctuation.
- Do not return HTML ruby tags — only the JSON segments above.
- Return valid JSON only.`;
}

export function buildSentenceAnkiUserPrompt(sentence: string, lang: string): string {
  const languageName = getLanguageDisplayName(lang);
  return `Create Anki card content for this ${languageName} sentence: "${sentence}"`;
}
