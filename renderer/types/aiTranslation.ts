/** JSON shape for AI translation results. Must stay in sync with utils/aiTranslationPrompts.ts schema. */
export interface TranslationVariant {
  text: string;
  pronunciation: string;
}

export interface TranslationGlossaryEntry {
  source: string;
  target: string;
  reading: string;
  meaning: string;
}

export interface TranslationChunkNote {
  register: 'formal' | 'neutral' | 'casual';
  chunk: string;
  note: string;
}

/** Grammar highlight for a translated sentence. Explanations are in English. */
export interface TranslationGrammarNote {
  pattern: string;
  explanation: string;
}

export interface SentenceTranslation {
  source: string;
  formal: TranslationVariant;
  neutral: TranslationVariant;
  casual: TranslationVariant;
  grammar: TranslationGrammarNote[];
  glossary: TranslationGlossaryEntry[];
  chunks: TranslationChunkNote[];
}

export interface AITranslationResult {
  sentences: SentenceTranslation[];
}
