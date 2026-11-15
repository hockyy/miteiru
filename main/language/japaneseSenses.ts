import {isKana, toHiragana} from "wanakana";
import type {JmdictSense, JmdictWord} from "../dictionary/jmdictDb";
import {rankJapaneseMatches, sameKanaReading} from "../handler/languages/learningGlosses";

/**
 * Choosing a JMdict entry and ranking its senses by how a word is used: the tokenizer's part of speech
 * (IPADIC tags such as 名詞-接尾-人名 or 助詞-格助詞-一般) and where the word sits in its sentence.
 * Without it, さん glossed as "acid" (酸, read さん) and と as "if; when" (its first sense), though the
 * line used them as the name suffix and "with".
 */

/** JMdict part-of-speech tags that fit an IPADIC tag, most specific rule first. */
const POS_FIT: Array<[RegExp, (tag: string) => boolean]> = [
  [/^名詞-接尾-人名/, (tag) => tag === "suf"],
  [/^名詞-接尾-助数詞/, (tag) => tag === "ctr" || tag === "suf"],
  [/^名詞-接尾/, (tag) => tag === "suf" || tag === "n-suf"],
  [/^名詞-数/, (tag) => tag === "num"],
  [/^名詞-代名詞/, (tag) => tag === "pn"],
  [/^名詞-副詞可能/, (tag) => tag === "n" || tag === "adv" || tag === "n-adv" || tag === "n-t"],
  [/^名詞-サ変接続/, (tag) => tag === "n" || tag === "vs"],
  [/^名詞-形容動詞語幹/, (tag) => tag === "adj-na" || tag === "n"],
  [/^名詞-ナイ形容詞語幹/, (tag) => tag === "adj-i" || tag === "n"],
  [/^名詞-非自立/, (tag) => tag === "n" || tag === "prt" || tag === "exp"],
  [/^名詞/, (tag) => tag === "n" || tag === "n-t" || tag === "n-adv"],
  [/^動詞-(非自立|接尾)/, (tag) => tag === "aux-v" || isVerbTag(tag)],
  [/^動詞/, (tag) => isVerbTag(tag)],
  [/^形容詞/, (tag) => tag === "adj-i" || tag === "adj-ix" || tag === "aux-adj"],
  [/^副詞/, (tag) => tag === "adv" || tag === "adv-to"],
  [/^助詞/, (tag) => tag === "prt"],
  [/^助動詞/, (tag) => tag === "aux" || tag === "aux-v" || tag === "aux-adj" || tag === "cop"],
  [/^接続詞/, (tag) => tag === "conj"],
  [/^感動詞/, (tag) => tag === "int"],
  [/^連体詞/, (tag) => tag === "adj-pn"],
  [/^接頭詞/, (tag) => tag === "pref"],
  [/^フィラー/, (tag) => tag === "int" || tag === "adv" || tag === "prt"]
];

// A verb class (v1, v5r, vk, vs-i, vz...), not "vs" (a noun that takes する) nor vi/vt (transitivity).
const isVerbTag = (tag: string) => /^v(?:1|2|4|5|k|n|r|z|s-|-unspec)/.test(tag);

/** Whether a JMdict sense's part of speech fits the IPADIC tag; undefined when the tag says nothing. */
export const senseFitsPos = (sense: JmdictSense, ipadicPos: string): boolean | undefined => {
  if (!ipadicPos) return undefined;
  const rule = POS_FIT.find(([pattern]) => pattern.test(ipadicPos));
  if (!rule) return undefined;
  return sense.partOfSpeech.some((tag) => rule[1](tag));
};

/**
 * Particles whose JMdict senses are all "prt": IPADIC's subtype says which use a line has.
 * Each rule: the IPADIC tag, and what the fitting sense says (in its glosses or notes).
 */
const PARTICLE_USES: Record<string, Array<[RegExp, RegExp]>> = {
  と: [
    [/格助詞-一般/, /\bwith\b/i],
    [/格助詞-引用/, /quot/i],
    [/並立助詞/, /^and\b/i],
    [/接続助詞/, /\bif\b|\bwhen\b/i]
  ],
  に: [[/格助詞/, /\bat\b|\bin\b|\bto\b/i]],
  で: [[/格助詞/, /\bat\b|\bin\b|\bby\b|\bwith\b/i]],
  が: [[/格助詞/, /subject/i], [/接続助詞/, /\bbut\b/i]],
  か: [[/副助詞／並立助詞／終助詞|終助詞/, /question/i], [/並立助詞/, /\bor\b/i]],
  や: [[/並立助詞/, /\band\b/i]],
  の: [[/連体化/, /possess|'s\b/i], [/格助詞/, /possess|'s\b|subject/i], [/終助詞/, /question|emphasis|sentence end/i]],
  から: [[/格助詞/, /\bfrom\b/i], [/接続助詞/, /\bbecause\b|\bsince\b/i]],
  けど: [[/接続助詞/, /\bbut\b|\bhowever\b/i]]
};

const senseText = (sense: JmdictSense) => [...sense.gloss.map((gloss) => gloss.text), ...sense.info].join("; ");

export interface SenseContext {
  /** The tokenizer's part of speech: an IPADIC tag such as 助詞-格助詞-一般. */
  pos?: string;
  /** The word ends its sentence (only punctuation or nothing follows). */
  sentenceEnd?: boolean;
  /** The word as written in the line, for the particle rules. */
  surface?: string;
}

const scoreSense = (sense: JmdictSense, index: number, context: SenseContext): number[] => {
  const text = senseText(sense);
  const particleRules = context.surface ? PARTICLE_USES[context.surface] ?? [] : [];
  const use = particleRules.find(([pattern]) => pattern.test(context.pos ?? ""));
  const info = sense.info.join(" ");
  const position = context.sentenceEnd === undefined || !/sentence end|non-final clause/.test(info) ? 0
    : (context.sentenceEnd ? /sentence end/.test(info) : /non-final clause/.test(info)) ? 1 : -1;
  return [
    senseFitsPos(sense, context.pos ?? "") === false ? 0 : 1,
    use ? (use[1].test(text) ? 1 : 0) : 0,
    position,
    sense.misc.some((tag) => tag === "arch" || tag === "obs" || tag === "rare") ? 0 : 1,
    -index
  ];
};

const compareScores = (a: number[], b: number[]) => {
  const key = a.findIndex((value, index) => value !== b[index]);
  return key < 0 ? 0 : b[key] - a[key];
};

/** The entry's senses, the one that fits the context best first; the rest keep JMdict's order. */
export const rankSenses = (entry: JmdictWord, context: SenseContext): JmdictSense[] => entry.sense
  .map((sense, index) => ({sense, score: scoreSense(sense, index, context)}))
  .sort((a, b) => compareScores(a.score, b.score))
  .map(({sense}) => sense);

/** The sense as one gloss line: its glosses joined, without parenthesised notes. */
export const senseLine = (sense: JmdictSense): string => sense.gloss
  .map((gloss) => gloss.text.replace(/\s*\((?:[^()]|\([^()]*\))*\)\s*/g, " ").trim())
  .filter(Boolean)
  .join("; ");

export interface JapaneseCandidateQuery {
  /** The dictionary form to look up. */
  base: string;
  /** Its kana reading, when known (for an inflected word only the surface's reading is known). */
  reading?: string;
  context: SenseContext;
}

const spelledAs = (word: JmdictWord, text: string) => word.kanji.some((kanji) => kanji.text === text);
const readAs = (word: JmdictWord, reading: string) => word.kana.some((kana) => sameKanaReading(kana.text, reading));

/**
 * The entries for a word, the one the line most likely means first: spelled (or, in kana, written) as
 * the word and read as it is read, then with a sense that fits its part of speech, then by
 * rankJapaneseMatches (exact, common, standalone, main spelling...).
 */
export const rankJapaneseEntries = (entries: JmdictWord[], {base, reading, context}: JapaneseCandidateQuery): JmdictWord[] => {
  const ranked = rankJapaneseMatches(entries, base);
  const kanaWord = isKana(base);
  const score = (word: JmdictWord, order: number): number[] => {
    const spelled = kanaWord ? word.kana.some((kana) => kana.text === base || sameKanaReading(kana.text, base)) : spelledAs(word, base);
    const read = reading ? readAs(word, reading) : false;
    const fits = word.sense.some((sense) => senseFitsPos(sense, context.pos ?? "") !== false);
    return [spelled && read ? 1 : 0, spelled ? 1 : 0, fits ? 1 : 0, -order];
  };
  return ranked
    .map((word, order) => ({word, score: score(word, order)}))
    .sort((a, b) => compareScores(a.score, b.score))
    .map(({word}) => word);
};

/** Hiragana for comparing readings; ー kept. */
export const kanaOf = (text: string) => toHiragana(text, {convertLongVowelMark: false});
