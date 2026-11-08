import type {DictionaryDb} from '../dictionary/levelDictionary';
import {exactJapaneseMatches} from '../handler/languages/learningGlosses';

// Check only terms that actually matched a saved AI entry. No startup scan of the user dictionary.
const cached = new WeakMap<DictionaryDb, Map<string, Promise<boolean>>>();
export const hasExactJapaneseDefault = (db: DictionaryDb, surface: string): Promise<boolean> => {
  let terms = cached.get(db);
  if (!terms) { terms = new Map(); cached.set(db, terms); }
  const existing = terms.get(surface);
  if (existing) return existing;
  const lookup = exactJapaneseMatches(db, surface).then((entries) => entries.length > 0);
  if (terms.size >= 2000) terms.delete(terms.keys().next().value);
  terms.set(surface, lookup);
  lookup.catch(() => { if (terms.get(surface) === lookup) terms.delete(surface); });
  return lookup;
};
