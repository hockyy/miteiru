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

const translationRegisters = ['formal', 'neutral', 'casual'] as const;

export type TranslationRegister = typeof translationRegisters[number];

/** Styles and learner notes requested with each translation. Off skips that part of the prompt. */
export interface TranslationDetailOptions {
  formal: boolean;
  neutral: boolean;
  casual: boolean;
  grammar: boolean;
  glossary: boolean;
  wordingNotes: boolean;
}

export const defaultTranslationDetailOptions: TranslationDetailOptions = {
  formal: true,
  neutral: true,
  casual: true,
  grammar: true,
  glossary: true,
  wordingNotes: true,
};

export function normalizeTranslationDetailOptions(
  value: Partial<TranslationDetailOptions> | null | undefined,
): TranslationDetailOptions {
  const options: TranslationDetailOptions = {
    formal: value?.formal !== false,
    neutral: value?.neutral !== false,
    casual: value?.casual !== false,
    grammar: value?.grammar !== false,
    glossary: value?.glossary !== false,
    wordingNotes: value?.wordingNotes !== false,
  };

  if (!options.formal && !options.neutral && !options.casual) {
    options.neutral = true;
  }

  return options;
}

export function selectedTranslationRegisters(details: TranslationDetailOptions): TranslationRegister[] {
  return translationRegisters.filter((register) => details[register]);
}

function translationRegisterPhrase(registers: TranslationRegister[]): string {
  if (registers.length === 3) {
    return 'Formal, neutral, and casual translations';
  }
  if (registers.length === 1) {
    const name = registers[0];
    return `${name[0].toUpperCase()}${name.slice(1)} translation`;
  }
  const [first, second] = registers;
  return `${first[0].toUpperCase()}${first.slice(1)} and ${second} translations`;
}

export function getTranslationLoadingSubMessage(details: Partial<TranslationDetailOptions>): string {
  const options = normalizeTranslationDetailOptions(details);
  const extras = [
    options.grammar ? 'grammar notes' : '',
    options.glossary ? 'glossary' : '',
    options.wordingNotes ? 'wording notes' : '',
  ].filter(Boolean);
  const registerPhrase = translationRegisterPhrase(selectedTranslationRegisters(options));

  if (extras.length === 0) {
    return `${registerPhrase} on the way`;
  }

  return `${registerPhrase}, ${extras.join(', ')} on the way`;
}

function buildTranslationSchemaFields(
  languageName: string,
  pronunciationLabel: string,
  details: TranslationDetailOptions,
): string[] {
  const registers = selectedTranslationRegisters(details);
  const fields = [`"source": "<original source sentence>"`];

  registers.forEach((register) => {
    fields.push(
      `"${register}": { "text": "<${register} ${languageName}>", "pronunciation": "<full-sentence ${pronunciationLabel}>" }`,
    );
  });

  if (details.grammar) {
    fields.push(
      `"grammar": [{ "pattern": "<pattern in ${languageName}>", "explanation": "<short English>" }]`,
    );
  }

  if (details.glossary) {
    fields.push(
      `"glossary": [{ "source": "<source>", "target": "<${languageName}>", "reading": "<reading>", "meaning": "<English>" }]`,
    );
  }

  if (details.wordingNotes) {
    const examples = registers
      .map((register) => `{ "register": "${register}", "chunk": "<phrase>", "note": "<brief note>" }`)
      .join(', ');
    fields.push(`"chunks": [${examples}]`);
  }

  return fields;
}

function buildTranslationRules(languageName: string, details: TranslationDetailOptions): string[] {
  const registers = selectedTranslationRegisters(details);
  const rules = [
    `Prioritize natural ${languageName} over literal word-by-word mapping.`,
    'Preserve names, URLs, code, commands, file paths, numbers, and product terms unless translation is clearly preferred.',
  ];

  if (registers.length === 3) {
    rules.splice(1, 0, 'Keep all three variants semantically equivalent; differences should be mainly tone and phrasing.');
  } else if (registers.length === 2) {
    rules.splice(1, 0, 'Keep the two variants semantically equivalent; differences should be mainly tone and phrasing.');
  }

  if (details.grammar) {
    rules.push('Include 2-4 grammar notes per sentence on key patterns or constructions used in the translation; use an empty array if none apply.');
  }

  if (details.glossary) {
    rules.push('Include 4-10 glossary entries per sentence when useful; use an empty array if none.');
  }

  if (details.wordingNotes) {
    const covered = registers.join(', ');
    rules.push(`Include brief chunk notes for key wording choices in the ${covered} ${registers.length === 1 ? 'variant' : 'variants'}; omit empty notes.`);
  }

  return rules;
}

function languageExtraRules(lang: TranslationTargetLang, details: TranslationDetailOptions): string[] {
  if (lang === languageCodes.mandarin) {
    return ['Default to Simplified Chinese unless the source explicitly asks for Traditional Chinese.'];
  }

  if (lang === languageCodes.cantonese) {
    const rules = [
      'Output written Cantonese in Traditional Chinese.',
      'Prefer distinctly Cantonese wording over Standard Written Chinese when useful.',
    ];
    if (details.casual) {
      rules.push('Casual variant must use spoken Cantonese style with natural colloquial particles when appropriate.');
    }
    return rules;
  }

  return [];
}

export function buildTranslationSystemPrompt(
  lang: TranslationTargetLang,
  details: Partial<TranslationDetailOptions> = defaultTranslationDetailOptions,
): string {
  const options = normalizeTranslationDetailOptions(details);
  const languageName = getLanguageDisplayName(lang);
  const pronunciationLabel = translationConfig[lang].pronunciationLabel;
  const extraRules = languageExtraRules(lang, options)
    .map((rule) => `- ${rule}`)
    .join('\n');
  const schemaFields = buildTranslationSchemaFields(languageName, pronunciationLabel, options)
    .map((field) => `      ${field}`)
    .join(',\n');
  const rules = buildTranslationRules(languageName, options)
    .map((rule, index) => `${index + 1}. ${rule}`)
    .join('\n');

  return `You are a ${languageName} translation assistant for language learners.

Translate each source sentence into natural ${languageName}. Respond with JSON only — no markdown, no prose outside the JSON object.

Schema:
{
  "sentences": [
    {
${schemaFields}
    }
  ]
}

Rules:
${rules}
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
