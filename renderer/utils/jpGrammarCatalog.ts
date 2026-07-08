import {
  GrammarLevelFilter,
  JlptLevel,
  JpGrammarCatalog,
  JpGrammarEntry,
} from '../types/jpGrammar';

export const JP_GRAMMAR_CATALOG_URL =
  '/language-assets/japanese/grammar/jp_grammar.json';

export const isJlptLevel = (value: string): value is JlptLevel =>
  value === 'N5' || value === 'N4' || value === 'N3' || value === 'N2' || value === 'N1';

export async function fetchJpGrammarCatalog(): Promise<JpGrammarCatalog> {
  const response = await fetch(JP_GRAMMAR_CATALOG_URL);
  if (!response.ok) {
    throw new Error(`Failed to load grammar catalog (${response.status})`);
  }

  const data = (await response.json()) as JpGrammarCatalog;
  if (!Array.isArray(data.entries)) {
    throw new Error('Invalid grammar catalog format');
  }

  return data;
}

export function filterGrammarByLevel(
  entries: JpGrammarEntry[],
  levelFilter: GrammarLevelFilter,
): JpGrammarEntry[] {
  if (levelFilter === 'all') {
    return entries;
  }
  return entries.filter((entry) => entry.level === levelFilter);
}

export function pickRandomGrammar(
  entries: JpGrammarEntry[],
): JpGrammarEntry | null {
  if (entries.length === 0) {
    return null;
  }
  const index = Math.floor(Math.random() * entries.length);
  return entries[index] ?? null;
}

export function getAdjacentGrammar(
  entries: JpGrammarEntry[],
  currentId: string,
  direction: -1 | 1,
): JpGrammarEntry | null {
  const currentIndex = entries.findIndex((entry) => entry.id === currentId);
  if (currentIndex < 0) {
    return null;
  }

  const nextIndex = currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= entries.length) {
    return null;
  }

  return entries[nextIndex] ?? null;
}

export const jlptLevelBadgeClass: Record<JlptLevel, string> = {
  N5: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  N4: 'bg-lime-100 text-lime-800 border-lime-300',
  N3: 'bg-amber-100 text-amber-900 border-amber-300',
  N2: 'bg-orange-100 text-orange-900 border-orange-300',
  N1: 'bg-rose-100 text-rose-900 border-rose-300',
};
