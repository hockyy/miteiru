/**
 * Prompts + language guards for AI translation (formal / neutral / casual).
 * Target langs: languages/manifest.ts languageCodes (ja, zh-CN, yue)
 * Parser + types: utils/parseAiTranslation.ts, types/aiTranslation.ts
 * Hook: hooks/useAiTranslation.ts | UI: components/Learn/AITranslationPanel.tsx
 * Detail sections: components/Learn/TranslationDetailSections.tsx
 */
import { getLanguageDisplayName, languageCodes } from '../languages/manifest';

export type TranslationTargetLang =
  | typeof languageCodes.japanese
  | typeof languageCodes.mandarin
  | typeof languageCodes.cantonese;

const translationConfig: Record<TranslationTargetLang, {
  pronunciationLabel: string;
}> = {
  [languageCodes.japanese]: {
    pronunciationLabel: 'Romaji',
  },
  [languageCodes.mandarin]: {
    pronunciationLabel: 'Pinyin',
  },
  [languageCodes.cantonese]: {
    pronunciationLabel: 'Jyutping',
  },
};

const supportedTranslationLangs = new Set<string>([
  languageCodes.japanese,
  languageCodes.mandarin,
  languageCodes.cantonese,
]);

export function getTranslationTargetLang(lang: string): TranslationTargetLang | null {
  // lang comes from languageCodes (e.g. zh-CN), not short codes like "zh"
  if (supportedTranslationLangs.has(lang)) {
    return lang as TranslationTargetLang;
  }
  return null;
}


export function buildTranslationSystemPrompt(lang: TranslationTargetLang): string {
  const languageName = getLanguageDisplayName(lang);
  const pronunciationLabel = translationConfig[lang].pronunciationLabel;
  const extraRules = lang === languageCodes.mandarin
    ? '- Default to Simplified Chinese unless the source explicitly asks for Traditional Chinese.'
    : lang === languageCodes.cantonese
      ? '- Output written Cantonese in Traditional Chinese.\n- Prefer distinctly Cantonese wording over Standard Written Chinese when useful.\n- Casual variant must use spoken Cantonese style with natural colloquial particles when appropriate.'
      : '';

  return `You are a ${languageName} translation assistant for language learners.

Translate each source sentence into natural ${languageName}. Respond with JSON only — no markdown, no prose outside the JSON object.

Schema:
{
  "sentences": [
    {
      "source": "<original source sentence>",
      "formal": { "text": "<formal ${languageName}>", "pronunciation": "<full-sentence ${pronunciationLabel}>" },
      "neutral": { "text": "<neutral ${languageName}>", "pronunciation": "<full-sentence ${pronunciationLabel}>" },
      "casual": { "text": "<casual ${languageName}>", "pronunciation": "<full-sentence ${pronunciationLabel}>" },
      "grammar": [
        { "pattern": "<grammar label or quoted phrase in ${languageName}>", "explanation": "<1-2 short sentences in English>" }
      ],
      "glossary": [
        { "source": "<source term>", "target": "<${languageName}>", "reading": "<reading if applicable>", "meaning": "<English gloss / nuance>" }
      ],
      "chunks": [
        { "register": "formal", "chunk": "<phrase>", "note": "<brief explanation>" },
        { "register": "neutral", "chunk": "<phrase>", "note": "<brief explanation>" },
        { "register": "casual", "chunk": "<phrase>", "note": "<brief explanation>" }
      ]
    }
  ]
}

Rules:
1. Prioritize natural ${languageName} over literal word-by-word mapping.
2. Keep all three variants semantically equivalent; differences should be mainly tone and phrasing.
3. Preserve names, URLs, code, commands, file paths, numbers, and product terms unless translation is clearly preferred.
4. Include 2-4 grammar notes per sentence on key patterns or constructions used in the translation; use an empty array if none apply.
5. Include 4-10 glossary entries per sentence when useful; use an empty array if none.
6. Include brief chunk notes for key wording choices; omit empty notes.
${extraRules ? `${extraRules}\n` : ''}Return valid JSON only.`;
}

export function buildTranslationUserPrompt(sentences: string[]): string {
  const numbered = sentences
    .map((sentence, index) => `${index + 1}. ${sentence}`)
    .join('\n');

  return `Translate each of the following sentences.

Sentences (one per line):
${numbered}`;
}

export function getUnsupportedLangMessage(lang: string): string {
  return `AI translation is available for Japanese, Chinese, and Cantonese. Current language "${lang ? getLanguageDisplayName(lang) : 'unknown'}" is not supported. Change the learning language in settings.`;
}

export function getPronunciationLabel(lang: TranslationTargetLang): string {
  return translationConfig[lang].pronunciationLabel;
}
