import type {Tokenizer, KuromojiToken} from 'kuromoji';
import {analyzeWithUserDictionary, userDictionaryToken, type UserDictionaryEntry} from './userDictionary';
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

export type JapaneseBackendTokenizer = Omit<Tokenizer, 'tokenize' | 'tokenizeForSentence'> & {
  tokenize(text: string): KuromojiToken[] | Promise<KuromojiToken[]>;
  tokenizeForSentence(text: string): KuromojiToken[] | Promise<KuromojiToken[]>;
  setUserWords?: (entries: UserDictionaryEntry[]) => Promise<void>;
  tokenizeWithUserWords?: (text: string, entries: UserDictionaryEntry[]) => Promise<KuromojiToken[]>;
};

export const tokenizeJapaneseWithEntries = async (tokenizer: JapaneseBackendTokenizer, sentence: string, entries?: UserDictionaryEntry[]): Promise<KuromojiToken[]> => {
  if (tokenizer.tokenizeWithUserWords && entries) return tokenizer.tokenizeWithUserWords(sentence, entries);
  if (tokenizer.setUserWords) {
    if (entries) await tokenizer.setUserWords(entries);
    return tokenizer.tokenizeForSentence(sentence);
  }
  if (!entries?.length) return tokenizer.tokenizeForSentence(sentence);
  const fragments = await analyzeWithUserDictionary(sentence, 'ja', entries, (text) => tokenizer.tokenizeForSentence(text));
  return fragments.map((token) => token.surface_form !== undefined ? token : {
    word_id: -1, word_type: 'KNOWN', word_position: 1, surface_form: token.origin, basic_form: token.origin,
    pos: '名詞', pos_detail_1: '一般', pos_detail_2: '*', pos_detail_3: '*', conjugated_type: '*', conjugated_form: '*',
  });
};
