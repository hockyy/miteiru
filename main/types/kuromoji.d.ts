// kuromoji 0.1.2 ships no type definitions; these cover the parts Miteiru uses.
declare module "kuromoji" {
  export interface KuromojiToken {
    word_id: number;
    word_type: string;
    word_position: number;
    surface_form: string;
    pos: string;
    pos_detail_1: string;
    pos_detail_2: string;
    pos_detail_3: string;
    conjugated_type: string;
    conjugated_form: string;
    basic_form: string;
    /** Undefined at runtime for unknown words. */
    reading: string;
    pronunciation: string;
  }

  export interface Tokenizer {
    tokenize(text: string): KuromojiToken[];
    /** Tokenizes `text` as one sentence, with word positions counted from its start. */
    tokenizeForSentence(text: string): KuromojiToken[];
  }

  interface TokenizerBuilder {
    build(callback: (error: Error | null, tokenizer: Tokenizer) => void): void;
  }

  export function builder(options: { dicPath: string }): TokenizerBuilder;
}
