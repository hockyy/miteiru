import {toHiragana, toKatakana} from "wanakana";
import {kanjiBeginning, readingBeginning, type JmdictWord} from "../../dictionary/jmdictDb";
import {charAnywhere, charBeginning} from "../../dictionary/chineseDictionaryDb";
import type {DictionaryDb} from "../../dictionary/levelDictionary";

/** One word to gloss under a learning-mode subtitle: its dictionary form and (Japanese) reading. */
export interface LearningGlossRequest {
  target: string;
  reading?: string;
}

// Token readings keep ー (こーひー) while JMdict may not, so compare both spelled out (こうひい).
export const sameKanaReading = (left: string, right: string): boolean =>
  toHiragana(toKatakana(left)) === toHiragana(toKatakana(right));

/**
 * Orders `queryJapanese` results: duplicates removed (keeping the last), common words first, then
 * among words with the same first spelling (or none) verbs, then nouns, then fewer spellings; the
 * first exact kanji match is moved to the front.
 */
export const rankJapaneseMatches = (matches: JmdictWord[], query: string, tags: Record<string, string>) => {
  const ids = matches.map((word) => word.id);
  const ranked = matches.filter(({id}, index) => !ids.includes(id, index + 1));
  const lacksPartOfSpeech = (word: JmdictWord, name: string) =>
    +!(tags[word.sense[0]?.partOfSpeech[0]] ?? "").includes(name);
  const firstSpelling = (word: JmdictWord) => (word.kanji.length ? word.kanji[0].text : null);
  ranked.sort((a, b) => {
    const commonA = a.kanji.length ? +a.kanji[0].common : 0;
    const commonB = b.kanji.length ? +b.kanji[0].common : 0;
    if (commonA !== commonB) return commonB - commonA;
    // The old comparator subtracted the spellings here (NaN, i.e. unordered) unless they were equal.
    if (firstSpelling(a) !== firstSpelling(b)) return 0;
    const verbOrder = lacksPartOfSpeech(a, "verb") - lacksPartOfSpeech(b, "verb");
    if (verbOrder) return verbOrder;
    const nounOrder = lacksPartOfSpeech(a, "noun") - lacksPartOfSpeech(b, "noun");
    if (nounOrder) return nounOrder;
    return a.kanji.length - b.kanji.length;
  });
  const exact = ranked.findIndex((word) => word.kanji.some((kanji) => kanji.text === query));
  if (exact > 0) [ranked[0], ranked[exact]] = [ranked[exact], ranked[0]];
  return ranked;
};

/**
 * The entry a learning word refers to: preferably one spelled `target` and read `reading` (数 read
 * かず is "number", not the 数 read しばしば), else the first spelled `target` or read `reading`.
 */
export const findJapaneseEntry = (entries: JmdictWord[], target: string, reading: string) => {
  const spelled = (word: JmdictWord) => word.kanji.some((kanji) => kanji.text === target);
  const read = (word: JmdictWord) => word.kana.some((kana) => sameKanaReading(kana.text, reading));
  return entries.find((word) => spelled(word) && read(word)) ?? entries.find((word) => spelled(word) || read(word));
};

/** The first gloss of `entry`, without parenthesised notes. */
const firstGloss = (entry: JmdictWord | undefined) =>
  (entry?.sense[0]?.gloss[0]?.text ?? "").replace(/\((.*?)\)/g, "").trim();

export const pickJapaneseGloss = (entries: JmdictWord[], target: string, reading: string): string =>
  firstGloss(findJapaneseEntry(entries, target, reading));

// Words read when nothing is spelled exactly `target` (成 read なる finds 成る); enough to reach the
// okurigana spellings, which sort before other kanji after `target`.
const SPELLING_PREFIX_FALLBACK = 200;

/**
 * Gloss for a Japanese learning word. Candidates are the first two words whose reading starts with
 * `target` and every word spelled exactly `target`; only when none fits are words whose spelling
 * starts with `target` read, and then a bounded number. `queryJapanese` reads all of those (817
 * entries for 人), which only its search results need.
 */
export const japaneseLearningGloss = async (
  db: DictionaryDb,
  tags: Record<string, string>,
  {target, reading = ""}: LearningGlossRequest
): Promise<string> => {
  if (!target || target === "*") return "";
  const byReading = await readingBeginning(db, target, 2);
  // The index key is `<spelling>-<id>`, so this prefix matches the exact spelling only.
  const exact = rankJapaneseMatches([...byReading, ...await kanjiBeginning(db, `${target}-`)], target, tags);
  const entry = findJapaneseEntry(exact, target, reading);
  if (entry) return firstGloss(entry);
  const prefixed = await kanjiBeginning(db, target, SPELLING_PREFIX_FALLBACK);
  return pickJapaneseGloss(rankJapaneseMatches([...byReading, ...prefixed], target, tags), target, reading);
};

/** Orders `queryChinese` results: duplicates removed, shortest headword first, then most meanings. */
export const rankChineseMatches = (matches: any[]) => {
  const ids = matches.map((entry) => entry.id);
  return matches
  .filter(({id}, index) => !ids.includes(id, index + 1))
  .sort((a, b) => {
    if (a.content.length !== b.content.length) return a.content.length - b.content.length;
    if (a.meaning.length !== b.meaning.length) return b.meaning.length - a.meaning.length;
    return a.content < b.content ? -1 : 1;
  });
};

/** Chinese dictionary matches for `query`, as the meaning panel searches them. */
export const queryChineseDictionary = async (db: DictionaryDb, query: string, limit: number) =>
  rankChineseMatches([...await charBeginning(db, query, limit), ...await charAnywhere(db, query, limit)]);

/** A short (≤ 10 characters) meaning of the first entry whose headword is exactly `target`. */
export const pickChineseGloss = (entries: any[], target: string): string => {
  for (const entry of entries) {
    const headwords = [...(entry.content ?? "").split("，"), ...(entry.simplified ?? "").split(", ")];
    if (!headwords.includes(target)) continue;
    let cleaned = (entry.meaning ?? []).join("\n");
    for (let pass = 0; pass < 3; pass++) cleaned = cleaned.replace(/\([^)(]*\)/, "");
    for (let pass = 0; pass < 3; pass++) cleaned = cleaned.replace(/\[[^\][]*]/, "");
    const meanings = cleaned.split(/[,;\n]/);
    if (meanings.length > 0 && meanings[0].length > 10) meanings.sort((a, b) => a.length - b.length);
    for (const meaning of meanings) {
      const short = meaning.trim().replace(/\(.*/, "").replace(/\|.*/, "");
      if (short !== "" && short.length <= 10) return short;
    }
    return "";
  }
  return "";
};

export const chineseLearningGloss = async (db: DictionaryDb, {target}: LearningGlossRequest): Promise<string> => {
  if (!target) return "";
  return pickChineseGloss(await queryChineseDictionary(db, target, 3), target);
};

/** The shortest meaningful part (≤ 15 characters) of a VNEDict meaning. */
export const pickVietnameseGloss = (meaning: string): string => {
  const cleaned = meaning.replace(/\([^)(]*\)/g, "").trim().replace(/\[[^\][]*]/g, "").trim();
  const parts = cleaned.split(/[,;]/).sort((a, b) => a.trim().length - b.trim().length);
  return parts.map((part) => part.trim()).find((part) => part !== "" && part.length <= 15) ?? "";
};

/** Glosses for a batch of words; a failed lookup yields "" rather than failing the batch. */
export const glossAll = (
  requests: LearningGlossRequest[],
  gloss: (request: LearningGlossRequest) => Promise<string> | string
): Promise<string[]> => Promise.all((Array.isArray(requests) ? requests : []).map(async (request) => {
  try {
    return await gloss(request ?? {target: ""});
  } catch (error) {
    console.error("[learningGlosses]", request?.target, error);
    return "";
  }
}));
