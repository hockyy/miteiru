/** JSON shape for AI sentence analysis. Must stay in sync with utils/aiAnalysisPrompts.ts schema. */
export interface GrammarPoint {
  pattern: string;
  explanation: string;
}

export interface VocabularyItem {
  word: string;
  reading?: string;
  meaning: string;
  note?: string;
}

export interface SentenceAnalysis {
  summary: string;
  /** Natural English translation of the analyzed sentence. */
  translation: string;
  grammar: GrammarPoint[];
  vocabulary: VocabularyItem[];
  culturalNotes: string[];
  learningTips: string[];
}

export const emptySentenceAnalysis = (): SentenceAnalysis => ({
  summary: '',
  translation: '',
  grammar: [],
  vocabulary: [],
  culturalNotes: [],
  learningTips: [],
});
