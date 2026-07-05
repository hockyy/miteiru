/**
 * Prompts for sentence AI analysis (grammar, vocab, tips) on /learn middle column.
 * Parser: utils/parseSentenceAnalysis.ts | Types: types/sentenceAnalysis.ts
 * Hook: hooks/useSentenceAnalysis.ts | UI: components/Learn/AIAnalysisPanel.tsx
 * Display sections: components/Learn/AIAnalysisSections.tsx
 */
import { getLanguageDisplayName } from '../languages/manifest';

export function buildAnalysisSystemPrompt(lang: string): string {
  const languageName = getLanguageDisplayName(lang);

  return `You are a ${languageName} language learning assistant. Analyze one learner sentence and respond with JSON only — no markdown, no prose outside the JSON object.

Schema:
{
  "summary": "<one concise English sentence: gist of the sentence, not a full translation>",
  "translation": "<natural English translation of the sentence>",
  "grammar": [
    { "pattern": "<grammar label or quoted phrase>", "explanation": "<1-2 short sentences in English>" }
  ],
  "vocabulary": [
    { "word": "<word in ${languageName}>", "reading": "<reading if applicable, else omit>", "meaning": "<English gloss>", "note": "<optional brief usage note>" }
  ],
  "culturalNotes": ["<optional note in English, omit section content if none>"],
  "learningTips": ["<short actionable tip in English>"]
}

Rules:
- Keep output compact: 2-3 grammar points, 3-5 vocabulary items, 0-2 cultural notes, 1-2 learning tips.
- "translation" should be one natural English rendering — no register variants needed.
- Focus on what helps a learner understand THIS sentence, not general textbook lectures.
- "word" must stay in ${languageName}; all explanations in English.
- Omit "reading" for languages where it does not apply.
- Return valid JSON only.`;
}

export function buildAnalysisUserPrompt(sentence: string, lang: string): string {
  const languageName = getLanguageDisplayName(lang);
  return `Analyze this ${languageName} sentence: "${sentence}"`;
}
