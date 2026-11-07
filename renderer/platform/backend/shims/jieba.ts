/** @node-rs/jieba replacement: the Rust side loads the dictionary file and segments text. */
import {sys} from '../sys';

export class Jieba {
  private constructor(private readonly key: string) {}

  /** Loads the dictionary at `dictPath` (main/handler/chinese.ts calls this when it exists). */
  static async withDictFile(dictPath: string): Promise<Jieba> {
    const key = `dict:${dictPath}`;
    await sys('jieba_load', {key, dictPath});
    return new Jieba(key);
  }

  static withDict(): never {
    throw new Error('Jieba.withDict(buffer) is not available in the Tauri backend; use Jieba.withDictFile(path)');
  }

  async cut(text: string, hmm = true): Promise<string[]> {
    return sys('jieba_cut', {key: this.key, text, hmm});
  }
}

export default {Jieba};
