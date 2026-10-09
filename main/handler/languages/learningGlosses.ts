import {isKana, isKanji, toHiragana, toKatakana} from "wanakana";
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

// Words used only attached to another: 人 read じん "-ian", 人 read にん (counter), 前 read ぜん "previous".
const AFFIX_POS = new Set(["pref", "suf", "ctr", "n-pref", "n-suf"]);
// Grammar uses that make a kana query mean this word: ている (居る), てくれる (呉れる), pronouns.
const GRAMMAR_POS = new Set(["pn", "aux", "aux-v", "aux-adj", "cop"]);

/**
 * Orders dictionary matches for a query, the word most likely meant first:
 * 1. spelled or read exactly as the query, 2. that exact spelling or reading is common,
 * 3. a standalone word rather than an affix or counter (人 → ひと, not じん "-ian"),
 * 4. the query is the word's main spelling (尤も "but then", not 最も "most" also spelled 尤も),
 * 5. any spelling or reading is common.
 * Then, for kana queries, words with a grammar use (いる → 居る, くれる → 呉れる) and the most
 * senses (とる → 取る, こと → 事); then the shorter headword (人形 before 人工知能); then JMdict
 * order, which lists the native word first (心 → こころ, 金 → かね). Duplicates are dropped.
 * Measured on 167 frequent lookups: scripts/evaluateJmdictRanking.ts.
 */
export const rankJapaneseMatches = (matches: JmdictWord[], query: string): JmdictWord[] => {
  const unique = [...new Map(matches.map((word) => [word.id, word])).values()];
  const kanaQuery = isKana(query);
  const score = (word: JmdictWord): number[] => {
    const elements = [...word.kanji, ...word.kana];
    const exact = elements.filter((element) => element.text === query);
    const firstPos = word.sense[0]?.partOfSpeech ?? [];
    const affixOnly = firstPos.length > 0 && firstPos.every((pos) => AFFIX_POS.has(pos));
    const mainSpelling = (word.kanji[0] ?? word.kana[0])?.text === query || word.kana[0]?.text === query;
    const grammar = word.sense.some((sense) => sense.partOfSpeech.some((pos) => GRAMMAR_POS.has(pos)));
    return [
      exact.length > 0 ? 1 : 0,
      exact.some((element) => element.common) ? 1 : 0,
      affixOnly ? 0 : 1,
      mainSpelling ? 1 : 0,
      elements.some((element) => element.common) ? 1 : 0,
      kanaQuery && grammar ? 1 : 0,
      kanaQuery ? word.sense.length : 0,
      -Math.min(...elements.map((element) => element.text.length)),
      -Number(word.id)
    ];
  };
  const scored = unique.map((word) => ({word, score: score(word)}));
  scored.sort((a, b) => {
    const key = a.score.findIndex((value, index) => value !== b.score[index]);
    return key < 0 ? 0 : b.score[key] - a.score[key];
  });
  return scored.map(({word}) => word);
};

/**
 * Every word spelled or read exactly `query`. Index keys are `<text>-<id>`, so a `<query>-` prefix
 * matches the exact text only; a plain prefix read is capped and can miss them (いい has eight
 * archaic entries before the common one).
 */
export const exactJapaneseMatches = async (db: DictionaryDb, query: string) =>
  (await Promise.all([readingBeginning(db, `${query}-`), kanjiBeginning(db, `${query}-`)])).flat();

/**
 * Dictionary search results for `query`, best first: every word read exactly `query`, `limit` more
 * whose reading starts with it (all when negative), and every word whose spelling starts with it.
 */
export const searchJapanese = async (db: DictionaryDb, query: string, limit = -1) => {
  const [exactReadings, spellings] = await Promise.all([
    readingBeginning(db, `${query}-`),
    kanjiBeginning(db, query)
  ]);
  // "-" sorts before kana, so a reading prefix scan returns the `<query>-<id>` keys first: skip past them.
  const readings = await readingBeginning(db, query, limit < 0 ? -1 : exactReadings.length + limit);
  return rankJapaneseMatches([...exactReadings, ...readings, ...spellings], query);
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
 * Gloss for a Japanese learning word. Candidates are the words spelled or read exactly `target`;
 * only when none fits are words whose spelling starts with `target` read, and then a bounded number.
 * `queryJapanese` reads all of those (817 entries for 人), which only its search results need.
 */
export const japaneseLearningGloss = async (
  db: DictionaryDb,
  {target, reading = ""}: LearningGlossRequest
): Promise<string> => {
  if (!target || target === "*") return "";
  const exact = await exactJapaneseMatches(db, target);
  const entry = findJapaneseEntry(rankJapaneseMatches(exact, target), target, reading);
  if (entry) return firstGloss(entry);
  // Spellings start with kanji; a kana word (a name, slang) missing from JMdict has nothing to find.
  if (![...target].some((character) => isKanji(character))) return "";
  const prefixed = await kanjiBeginning(db, target, SPELLING_PREFIX_FALLBACK);
  return pickJapaneseGloss(rankJapaneseMatches([...exact, ...prefixed], target), target, reading);
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
