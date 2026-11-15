/**
 * Laying a tokenizer's tokens over the text they came from, so that the pieces concatenate to exactly
 * that text: every space, punctuation mark and character the tokenizer dropped or changed becomes a
 * piece of its own. The language tools promise this of analyze_text's tokens.
 */

export type PieceKind = "word" | "space" | "punct" | "symbol";

export interface Piece<T> {
  /** Exactly the text it covers. */
  s: string;
  /** Offsets in Unicode code points (what Python's str indexes), end exclusive. */
  start: number;
  end: number;
  kind: PieceKind;
  /** The token that produced it; absent for text no token covered. */
  token?: T;
}

const SPACE = /^\s+$/u;
const PUNCT = /^\p{P}+$/u;
const SYMBOL_OR_PUNCT = /^[\p{P}\p{S}\p{M}️‍]+$/u;
const HAS_WORD = /[\p{L}\p{N}]/u;

/** What a piece of text is when no tokenizer says: space, punctuation, a symbol (★, 😀) or a word. */
export const kindOf = (text: string): PieceKind => {
  if (SPACE.test(text)) return "space";
  if (PUNCT.test(text)) return "punct";
  if (!HAS_WORD.test(text) && SYMBOL_OR_PUNCT.test(text)) return "symbol";
  return "word";
};

const graphemes = (text: string): string[] => {
  const Segmenter = (Intl as unknown as {Segmenter?: new (locale: string, options: {granularity: string}) => {segment(text: string): Iterable<{segment: string}>}}).Segmenter;
  return Segmenter ? Array.from(new Segmenter("und", {granularity: "grapheme"}).segment(text), (part) => part.segment) : Array.from(text);
};

/**
 * Text no token covered, split into pieces: runs of spaces, each punctuation mark or symbol on its own,
 * and runs of letters and digits as words.
 */
export const splitUncovered = (text: string): Array<{s: string; kind: PieceKind}> => {
  const pieces: Array<{s: string; kind: PieceKind}> = [];
  for (const grapheme of graphemes(text)) {
    const kind = kindOf(grapheme);
    const last = pieces.at(-1);
    if (last && last.kind === kind && (kind === "space" || kind === "word")) last.s += grapheme;
    else pieces.push({s: grapheme, kind});
  }
  return pieces;
};

/** How far past the cursor a token's surface may be found; further means it is not this token's text. */
const SEARCH_WINDOW = 64;

/**
 * The tokens in order over `text`. `surfaceOf` is the text a token covers. A token found at the cursor
 * takes its text; one found a little further leaves the text in between as uncovered pieces; one not
 * found (a tokenizer that normalized it) is dropped and its text is left to the uncovered pieces. The
 * pieces' `s` always join to `text`.
 */
export const alignTokens = <T>(text: string, tokens: readonly T[], surfaceOf: (token: T) => string): Piece<T>[] => {
  const placed: Array<{s: string; kind: PieceKind; token?: T}> = [];
  let cursor = 0;
  const uncovered = (until: number) => {
    if (until > cursor) placed.push(...splitUncovered(text.slice(cursor, until)));
    cursor = Math.max(cursor, until);
  };
  for (const token of tokens) {
    const surface = surfaceOf(token);
    if (!surface) continue;
    const at = text.startsWith(surface, cursor) ? cursor : text.indexOf(surface, cursor);
    if (at < 0 || at - cursor > SEARCH_WINDOW) continue;
    uncovered(at);
    placed.push({s: surface, kind: kindOf(surface), token});
    cursor = at + surface.length;
  }
  uncovered(text.length);

  const pieces: Piece<T>[] = [];
  let codePoint = 0;
  for (const piece of placed) {
    const length = Array.from(piece.s).length;
    pieces.push({...piece, start: codePoint, end: codePoint + length});
    codePoint += length;
  }
  return pieces;
};
