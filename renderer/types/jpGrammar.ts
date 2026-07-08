export type JlptLevel = 'N5' | 'N4' | 'N3' | 'N2' | 'N1';

export const JLPT_LEVELS: readonly JlptLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1'];

export type GrammarLevelFilter = JlptLevel | 'all';

export interface JpGrammarEntry {
  id: string;
  level: JlptLevel;
  index: number;
  form: string;
  reading: string;
  meaning: string;
  source?: string;
}

export interface JpGrammarCatalog {
  version: number;
  count: number;
  entries: JpGrammarEntry[];
}

export interface GrammarExample {
  sentence: string;
  meaning: string;
}

export interface GrammarUserData {
  examples: GrammarExample[];
  usageNote: string;
  funFact: string;
  relatedGrammar: string[];
  updatedAt: number;
}

export interface GrammarNotesDatabase {
  [grammarId: string]: GrammarUserData;
}

export interface GrammarStudyEntry extends JpGrammarEntry {
  userData: GrammarUserData | null;
}
