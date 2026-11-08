/**
 * Finding words in the My words panel (VocabSidebar): a search box, and the level chips as filters.
 * With thousands of saved words, scrolling was the only way to a given one.
 */

/** Which level chip is on: a learning level (0 New … 3 Mastered), words with AI notes, or none. */
export type VocabLevelFilter = number | 'notes' | null;

export type VocabFilter = {
  query: string;
  level: VocabLevelFilter;
};

export const NO_VOCAB_FILTER: VocabFilter = {query: '', level: null};

/** Case- and width-insensitive form for matching ("ＡＢＣ" finds "abc", "Dog" finds "dog"). */
const searchForm = (text: string) => text.normalize('NFKC').toLocaleLowerCase();

export const isFiltering = (filter: VocabFilter) => filter.query.trim() !== '' || filter.level !== null;

/**
 * The saved words a filter keeps, in their order. The query matches the word, or the meaning in its
 * AI note (so "dog" finds 犬 once 犬 has notes).
 */
export const filterVocab = <T extends readonly [string, { level: number }]>(
  entries: readonly T[],
  filter: VocabFilter,
  noteMeaning: (word: string) => string | undefined,
  hasNotes: (word: string) => boolean,
): readonly T[] => {
  if (!isFiltering(filter)) return entries;
  const query = searchForm(filter.query.trim());
  return entries.filter(([word, state]) => {
    if (filter.level === 'notes' ? !hasNotes(word) : filter.level !== null && state.level !== filter.level) {
      return false;
    }
    if (!query) return true;
    if (searchForm(word).includes(query)) return true;
    const meaning = noteMeaning(word);
    return meaning ? searchForm(meaning).includes(query) : false;
  });
};
