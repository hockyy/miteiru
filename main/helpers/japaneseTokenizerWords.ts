import {userDictionaryToken, type UserDictionaryEntry} from './userDictionary';
import type {MiteiruJapaneseWordWithSeparations} from '../handler/languages/japaneseAnalysis';
import {hasExactJapaneseDefault} from './japaneseDictionaryPriority';
import type {DictionaryDb} from '../dictionary/levelDictionary';

const filteredEntries = new WeakMap<UserDictionaryEntry[], {db: DictionaryDb | null; entries: Promise<UserDictionaryEntry[]>}>();

export const japaneseUserDictionaryToken = (entry: UserDictionaryEntry, toneType = 'num') => {
  if (entry.language !== 'ja') throw new Error('Expected a Japanese user entry');
  return userDictionaryToken(entry, toneType) as MiteiruJapaneseWordWithSeparations & ReturnType<typeof userDictionaryToken>;
};

export const japaneseTokenizerEntries = (entries: UserDictionaryEntry[], db: DictionaryDb | null) => {
  const cached = filteredEntries.get(entries);
  if (cached?.db === db) return cached.entries;
  const filtered = Promise.all(entries.map(async (entry) => entry.source === 'manual' || !db
    || !await hasExactJapaneseDefault(db, entry.surface) ? entry : null))
    .then((result) => result.filter((entry): entry is UserDictionaryEntry => entry !== null));
  filteredEntries.set(entries, {db, entries: filtered});
  return filtered;
};
