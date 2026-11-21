import type {JapaneseToken} from '../../../../main/handler/languages/japaneseAnalysis';
import type {UserDictionaryEntry} from '../../../../main/helpers/userDictionary';
import {getStore} from '../../../../main/handler/common/storeHandlers';
import {sys} from '../sys';
import {decodeJapaneseTokenBatch} from './japaneseTokenBatch';

export const JAPANESE_APP_WORDS_KEY = 'tokenizer.japanese.useJmdictWords';

type Word = {surface: string; source: string};
type Request = {text: string; entries?: UserDictionaryEntry[]; words?: Word[]; revision?: string;
  resolve: (tokens: JapaneseToken[]) => void; reject: (error: unknown) => void};

export class JapaneseTokenizer {
  private entries: UserDictionaryEntry[] | undefined;
  private syncing: Promise<void> = Promise.resolve();
  private nativeRevision: string | undefined;
  private pending: Request[] = [];
  private scheduled = false;
  private versions = new WeakMap<UserDictionaryEntry[], {words: Word[]; revision: string}>();

  private constructor(private readonly dictPath: string) {}

  static async load(dictPath: string, jmdictPath?: string) {
    const store = await getStore();
    await sys('japanese_load', {dictPath, jmdictPath: jmdictPath ?? null,
      appWords: store.get(JAPANESE_APP_WORDS_KEY, false) === true});
    return new JapaneseTokenizer(dictPath);
  }

  async setUserWords(entries: UserDictionaryEntry[]) {
    if (entries === this.entries) return this.syncing;
    const words = entries.map(({surface, source}) => ({surface, source}));
    const revision = JSON.stringify(words);
    this.syncing = this.syncing.catch(() => undefined).then(async () => {
      await sys('japanese_set_words', {dictPath: this.dictPath, revision, words});
      this.entries = entries;
      this.nativeRevision = revision;
    });
    return this.syncing;
  }

  tokenizeForSentence(text: string): Promise<JapaneseToken[]> { return this.request(text); }

  tokenizeWithUserWords(text: string, entries: UserDictionaryEntry[]): Promise<JapaneseToken[]> {
    return this.request(text, entries);
  }

  private request(text: string, entries?: UserDictionaryEntry[]): Promise<JapaneseToken[]> {
    let version = entries ? this.versions.get(entries) : undefined;
    if (entries && !version) {
      const words = entries.map(({surface, source}) => ({surface, source}));
      version = {words, revision: JSON.stringify(words)};
      this.versions.set(entries, version);
    }
    return new Promise((resolve, reject) => {
      this.pending.push({text, entries, ...version, resolve, reject});
      if (this.scheduled) return;
      this.scheduled = true;
      setTimeout(() => {
        this.scheduled = false;
        const pending = this.pending;
        this.pending = [];
        this.syncing = this.syncing.catch(() => undefined).then(() => this.flush(pending));
      }, 0);
    });
  }

  private async flush(pending: Request[]) {
    for (let start = 0; start < pending.length;) {
      let end = start + 1;
      while (end < pending.length && pending[end].revision === pending[start].revision) end++;
      const first = pending[start];
      try {
        if (first.revision !== undefined && first.revision !== this.nativeRevision) {
          await sys('japanese_set_words', {dictPath: this.dictPath, revision: first.revision, words: first.words});
          this.nativeRevision = first.revision;
          this.entries = first.entries;
        }
      } catch (error) {
        pending.slice(start, end).forEach((request) => request.reject(error));
        start = end;
        continue;
      }
      while (start < end) {
        const chunks: Request[][] = [];
        while (start < end && chunks.length < 4) {
          let next = start + 1;
          let bytes = pending[start].text.length * 3;
          while (next < end && next - start < 128 && bytes + pending[next].text.length * 3 <= 1024 * 1024) {
            bytes += pending[next++].text.length * 3;
          }
          chunks.push(pending.slice(start, next));
          start = next;
        }
        await Promise.all(chunks.map((requests) => this.dispatch(requests)));
      }
    }
  }

  private async dispatch(requests: Request[]) {
    try {
      let tokens: JapaneseToken[][];
      if (requests.length === 1) tokens = [await sys('japanese_tokenize', {dictPath: this.dictPath, text: requests[0].text})];
      else {
        const response = await sys('japanese_tokenize_batch', {dictPath: this.dictPath, texts: requests.map((request) => request.text)});
        tokens = response instanceof ArrayBuffer ? decodeJapaneseTokenBatch(response) : response;
      }
      if (!Array.isArray(tokens) || tokens.length !== requests.length) throw new Error('Japanese tokenizer returned an incomplete batch');
      requests.forEach((request, index) => request.resolve(tokens[index]));
    } catch (error) { requests.forEach((request) => request.reject(error)); }
  }

  tokenize(text: string) { return this.tokenizeForSentence(text); }
}
