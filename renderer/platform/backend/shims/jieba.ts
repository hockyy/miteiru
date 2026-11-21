/** The Mandarin and Cantonese tokenizers load their word lists and segment text in Rust. */
import {sys} from '../sys';

export class Jieba {
  private constructor(private readonly key: string) {}

  /** Loads the dictionary at `dictPath` (main/handler/chinese.ts calls this when it exists). */
  static async withDictFile(dictPath: string, dictionaryPath?: string): Promise<Jieba> {
    const key = `dict:${dictPath}`;
    await sys('jieba_load', {key, dictPath, dictionaryPath});
    return new Jieba(key);
  }

  async cut(text: string, hmm = true): Promise<string[]> {
    return sys('jieba_cut', {key: this.key, text, hmm});
  }

  async setUserWords(words: {surface: string; source: string}[]): Promise<void> {
    await sys('jieba_user_words', {key: this.key, words});
  }
}
