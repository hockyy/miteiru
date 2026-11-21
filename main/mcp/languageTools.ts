import {isKana, toHiragana, toRomaji} from "../language/wanakana";
import type {DictionaryDb} from "../dictionary/levelDictionary";
import type {JmdictWord} from "../dictionary/jmdictDb";
import {exactChineseEntries, exactJapaneseMatches} from "../handler/languages/learningGlosses";
import {buildInflectionTable} from "../handler/languages/inflectionTable";
import type {UserDictionaryEntry} from "../helpers/userDictionary";
import {mapLimit} from "../helpers/mapLimit";
import {normalizeChineseEntry, rankChineseEntries, entryHasReading, shortSense, type ChineseEntryView} from "../language/chineseEntries";
import {lookupHsk, type HskWords} from "../language/hsk";
import {japaneseRuby, chineseRuby, type RubySegment} from "../language/japaneseRuby";
import {japaneseLevelFields, type JapaneseLevels} from "../language/japaneseLevels";
import {rankJapaneseEntries, rankSenses, senseFitsPos, senseLine, type SenseContext} from "../language/japaneseSenses";
import {isToolLanguage, toolLanguageInfo, type StoredLanguageCode, type ToolLanguage, type ToolLanguageInfo} from "../language/languages";
import {mandarinSpokenTones} from "../language/mandarinTones";
import {classifyAccent, lookupPitchAccent, splitIntoMorae, type PitchAccentMap} from "../language/pitchAccent";
import {comparableJyutping, comparablePinyin, numberedTone, pinyinMarked, pinyinNumbered, pinyinToNumbersBatch, stripVietnamese, vietnameseTone} from "../language/readings";
import {alignTokens, type Piece} from "../language/tokenAlign";
import {ToolError} from "./protocol";
import {isCountedWord, wordKey} from "./videoCoverage";

/**
 * The language tools (docs/LOCAL_API.md): analyze_text's full detail and the dictionary tools. Every
 * fact comes from Miteiru's tokenizers and the dictionaries on this computer (JMdict, KANJIDIC,
 * CC-CEDICT, CantoDict, VNEDict, Kanjium pitch accents, HSK and JLPT lists), never from a model.
 * The app's backend worker and the headless server (main/headless) give these the same engines
 * through LanguageToolDeps (main/mcp/languageDeps.ts).
 */

export type SavedWords = Record<string, {level: number; updTime: number}>;

export interface LanguageToolDeps {
  /** The learner's language, for a call that names none; null when none was chosen. */
  defaultLanguage(): Promise<ToolLanguage | null>;
  /** Loads the language's tokenizer and dictionaries if needed; throws when its data isn't installed. */
  ensureLanguage(language: ToolLanguage): Promise<void>;
  /** Miteiru's tokens for `text`, as the subtitles split it; readings as tone numbers unless `toneType` says otherwise. */
  analyze(language: ToolLanguage, text: string, toneType?: string): Promise<any[]>;
  jmdict(): DictionaryDb | null;
  /** JMdict's tag descriptions ("v5r" → "Godan verb with 'ru' ending"). */
  jmdictTags(): Record<string, string>;
  kanjidic(): DictionaryDb | null;
  /** The Chinese dictionary of a language (CC-CEDICT for zh-CN, CantoDict for yue). */
  chineseDictionary(code: "zh-CN" | "yue"): DictionaryDb | null;
  vietnameseDictionary(): Map<string, string> | null;
  /** Stroke-order SVG text: KanjiVG for Japanese kanji, Make Me a Hanzi for Chinese; "" when there is none. */
  strokeSvg(set: "kanji" | "hanzi", character: string): Promise<string>;
  savedWords(code: StoredLanguageCode): Promise<SavedWords>;
  /** Writes levels through the app's store (newer entries win); tells an open window to reload them. */
  saveWordLevels(code: StoredLanguageCode, entries: SavedWords): Promise<void>;
  /** The learner's own words for the language ("Your dictionary"), when it is turned on. */
  userWords(code: StoredLanguageCode): Promise<UserDictionaryEntry[]>;
  pitchAccents(): Promise<PitchAccentMap | null>;
  hskWords(): Promise<HskWords | null>;
  japaneseLevels(): Promise<JapaneseLevels | null>;
  now?(): number;
}

/** analyze_text's full-detail shape version; bumped when a field changes meaning. */
export const FULL_FORMAT = 2;
const MAX_SENSES = 8;
const MAX_ALTERNATIVES = 3;
const LINES_AT_ONCE = 4;
const MAX_TOTAL_CHARACTERS = 200_000;

export const SAVED_LEVELS = ["new", "learning", "known"] as const;
export type SavedLevel = typeof SAVED_LEVELS[number];

/** A stored level as the tools name it. 0 is New saved explicitly; 3 (common in a video) is never stored but reads as Known. */
export const savedLevelName = (level: number | undefined): SavedLevel => (level === 1 ? "learning" : level === 2 || level === 3 ? "known" : "new");

const levelOf = (saved: SavedWords, key: string) => (Object.prototype.hasOwnProperty.call(saved, key) ? saved[key]?.level : undefined);

const languageSummary = (info: ToolLanguageInfo) => ({code: info.id, name: info.name});

const codePoints = (text: string) => Array.from(text).length;

// ---- Coarse parts of speech ------------------------------------------------------------------------

export const POS_VALUES = ["noun", "proper_noun", "pronoun", "verb", "adjective", "adverb", "particle", "auxiliary",
  "conjunction", "interjection", "determiner", "numeral", "classifier", "prefix", "suffix", "filler", "idiom",
  "expression", "word", "other", "punct", "space", "symbol"] as const;
export type Pos = typeof POS_VALUES[number];

/** A coarse part of speech for an IPADIC tag (名詞-固有名詞-人名 → proper_noun). */
export const japanesePos = (tag: string): Pos => {
  const [main, detail, more] = (tag ?? "").split("-");
  switch (main) {
    case "名詞":
      if (detail === "固有名詞") return "proper_noun";
      if (detail === "代名詞") return "pronoun";
      if (detail === "数") return "numeral";
      if (detail === "接尾") return more === "助数詞" ? "classifier" : "suffix";
      if (detail === "形容動詞語幹" || detail === "ナイ形容詞語幹") return "adjective";
      return "noun";
    case "動詞": return "verb";
    case "形容詞": return "adjective";
    case "副詞": return "adverb";
    case "助詞": return "particle";
    case "助動詞": return "auxiliary";
    case "接続詞": return "conjunction";
    case "感動詞": return "interjection";
    case "連体詞": return "determiner";
    case "接頭詞": return "prefix";
    case "フィラー": return "filler";
    case "記号": return "symbol";
    default: return "other";
  }
};

/** A coarse part of speech for a jieba tag's first letter (CC-CEDICT has none). */
export const chinesePos = (part: string | null | undefined): Pos => {
  if (!part) return "word";
  if (/^n[rstz]/.test(part)) return "proper_noun";
  if (part === "eng") return "word";
  switch (part[0]) {
    case "n": case "t": case "s": case "f": return "noun";
    case "R": return "proper_noun";
    case "r": return "pronoun";
    case "v": return "verb";
    case "a": case "b": case "z": return "adjective";
    case "d": return "adverb";
    case "m": return "numeral";
    case "q": return "classifier";
    case "p": return "particle";
    case "u": case "y": return "particle";
    case "c": return "conjunction";
    case "e": case "o": return "interjection";
    case "i": return "idiom";
    case "l": return "expression";
    case "h": return "prefix";
    case "k": return "suffix";
    case "w": return "punct";
    default: return "other";
  }
};

// ---- Dictionary lookups, cached per database ---------------------------------------------------------

const lookupCaches = new WeakMap<object, Map<string, Promise<any[]>>>();
const LOOKUP_CACHE_SIZE = 20_000;

/** A lookup kept per database (the dictionaries don't change while open), the oldest out first. */
const cached = (db: object, key: string, read: () => Promise<any[]>): Promise<any[]> => {
  let cache = lookupCaches.get(db);
  if (!cache) {
    cache = new Map();
    lookupCaches.set(db, cache);
  }
  const hit = cache.get(key);
  if (hit) return hit;
  const pending = read();
  if (cache.size >= LOOKUP_CACHE_SIZE) cache.delete(cache.keys().next().value!);
  cache.set(key, pending);
  pending.catch(() => {
    if (cache!.get(key) === pending) cache!.delete(key);
  });
  return pending;
};

const japaneseEntries = (db: DictionaryDb, word: string): Promise<JmdictWord[]> => cached(db, `ja\u0000${word}`, () => exactJapaneseMatches(db, word));

const chineseEntries = (db: DictionaryDb, word: string): Promise<ChineseEntryView[]> => cached(db, `zh\u0000${word}`, async () => (
  (await exactChineseEntries(db, word)).map(normalizeChineseEntry).filter((entry): entry is ChineseEntryView => entry !== null)
));

// ---- Building blocks ---------------------------------------------------------------------------------

/** A JMdict reading that fits: the token's reading for an uninflected word, else the entry's first common one. */
const entryReading = (entry: JmdictWord | undefined, base: string, kana: string, inflected: boolean): string => {
  if (!entry) return inflected ? "" : kana;
  if (!inflected && kana && entry.kana.some((reading) => toHiragana(reading.text) === toHiragana(kana))) return kana;
  const applies = entry.kana.filter((reading) => reading.appliesToKanji.includes("*") || reading.appliesToKanji.includes(base));
  const pick = applies.find((reading) => reading.common) ?? applies[0] ?? entry.kana[0];
  return pick ? toHiragana(pick.text, {convertLongVowelMark: false}) : "";
};

const pitchOf = (map: PitchAccentMap | null, spelling: string, reading: string) => {
  if (!map || !reading) return undefined;
  const accents = lookupPitchAccent(map, spelling, reading);
  if (!accents?.length) return undefined;
  const morae = splitIntoMorae(toHiragana(reading, {convertLongVowelMark: false}));
  return {reading: toHiragana(reading, {convertLongVowelMark: false}), accents, patterns: accents.map((accent) => classifyAccent(accent, morae.length)), morae};
};

const jmdictGloss = (entry: JmdictWord, context: SenseContext, alternatives: JmdictWord[]) => {
  const senses = rankSenses(entry, context).map(senseLine).filter(Boolean);
  return {
    en: senses.slice(0, MAX_SENSES),
    source: "JMdict",
    entry_id: entry.id,
    ...(alternatives.length > 0 ? {
      alternatives: alternatives.slice(0, MAX_ALTERNATIVES).map((other) => ({entry_id: other.id, en: rankSenses(other, context).map(senseLine).filter(Boolean).slice(0, 2)}))
    } : {})
  };
};

const chineseGloss = (entry: ChineseEntryView, source: string, alternatives: ChineseEntryView[]) => ({
  en: entry.senses.length > 0 ? entry.senses.slice(0, MAX_SENSES) : entry.references.slice(0, MAX_SENSES),
  source,
  entry_id: entry.id,
  ...(entry.measureWords.length > 0 ? {measure_words: entry.measureWords} : {}),
  ...(entry.senses.length > 0 && entry.references.length > 0 ? {references: entry.references} : {}),
  ...(entry.standardChinese ? {standard_chinese: entry.standardChinese} : {}),
  ...(alternatives.length > 0 ? {alternatives: alternatives.slice(0, MAX_ALTERNATIVES).map((other) => ({entry_id: other.id, en: (other.senses.length ? other.senses : other.references).slice(0, 2)}))} : {})
});

const userGloss = (entry: UserDictionaryEntry) => ({
  en: [entry.meaning],
  source: "Your dictionary",
  entry_id: `user:${entry.language}:${entry.surface}`,
  user_source: entry.source
});

/** VNEDict's one meaning line as senses: its ; and , parts. */
const vietnameseSenses = (meaning: string) => meaning.split(/\s*;\s*/).map((part) => part.trim()).filter(Boolean);

const SENTENCE_FINAL = /^[。．.！!？?…]+$/u;

/** Whether piece `index` ends its sentence: only spaces and punctuation, then a sentence end or nothing, follow. */
const endsSentence = (pieces: Piece<any>[], index: number) => {
  for (let next = index + 1; next < pieces.length; next++) {
    const piece = pieces[next];
    if (piece.kind === "word") return false;
    if (piece.kind === "punct" && SENTENCE_FINAL.test(piece.s)) return true;
  }
  return true;
};

// ---- Aligning each language's tokens ------------------------------------------------------------------

const PUNCT_EDGES = /^([\p{P}\p{S}]*)([\s\S]*?)([\p{P}\p{S}]*)$/u;

/** Vietnamese tokens list their raw chunks, punctuation attached ("Nga,"): a token covers its words only. */
const vietnameseSpans = (text: string, tokens: any[]) => {
  const spans: Array<{surface: string; token: any}> = [];
  let cursor = 0;
  for (const token of tokens) {
    const chunks: string[] = (token?.separation ?? []).map((part: any) => String(part?.main ?? "")).filter(Boolean);
    let start = -1;
    let end = cursor;
    for (const chunk of chunks) {
      const at = text.indexOf(chunk, end);
      if (at < 0) {
        start = -1;
        break;
      }
      if (start < 0) start = at;
      end = at + chunk.length;
    }
    if (start < 0) continue;
    const [, , core] = text.slice(start, end).match(PUNCT_EDGES) ?? [];
    if (core) spans.push({surface: core, token});
    cursor = end;
  }
  return spans;
};

const alignLanguage = (language: ToolLanguage, text: string, tokens: any[]): Piece<any>[] => {
  if (language === "vi") {
    return alignTokens(text, vietnameseSpans(text, tokens), (span) => span.surface)
      .map((piece) => ({...piece, token: piece.token?.token}));
  }
  return alignTokens(text, tokens, (token) => String(token?.origin ?? ""));
};

// ---- The tools ------------------------------------------------------------------------------------------

export interface LanguageCallContext {
  info: ToolLanguageInfo;
  saved: SavedWords;
  userWords: Map<string, UserDictionaryEntry>;
}

export const createLanguageTools = (deps: LanguageToolDeps) => {
  const now = deps.now ?? Date.now;

  /** The call's language, its engine loaded: the one named, else the learner's. */
  const languageOf = async (requested: unknown): Promise<ToolLanguageInfo> => {
    let id: ToolLanguage | null;
    if (requested === undefined || requested === null) {
      id = await deps.defaultLanguage();
      if (!id) throw new ToolError("No language was given, and none is chosen in Miteiru. Pass language: ja, zh-Hans, zh-Hant, yue or vi.", 409);
    } else if (isToolLanguage(requested)) {
      id = requested;
    } else {
      throw new ToolError("language must be one of: ja, zh-Hans, zh-Hant, yue, vi");
    }
    await deps.ensureLanguage(id);
    return toolLanguageInfo(id);
  };

  const callContext = async (info: ToolLanguageInfo): Promise<LanguageCallContext> => {
    const [saved, userWords] = await Promise.all([deps.savedWords(info.code), deps.userWords(info.code).catch((): UserDictionaryEntry[] => [])]);
    return {info, saved, userWords: new Map(userWords.map((entry): [string, UserDictionaryEntry] => [entry.surface, entry]))};
  };

  // ---- analyze: one text -------------------------------------------------------------------------------

  const japaneseToken = async (piece: Piece<any>, pieces: Piece<any>[], index: number, context: LanguageCallContext, data: StudyData) => {
    const token = piece.token;
    const base = wordKey(token);
    const kana = typeof token.hiragana === "string" ? token.hiragana : "";
    const tag = typeof token.pos === "string" ? token.pos : "";
    const user = token.userDictionaryMeaning !== undefined ? context.userWords.get(token.origin) : undefined;
    const romaji = (token.separation ?? []).map((part: any) => part?.romaji ?? "").join("") || toRomaji(kana);
    const inflected = piece.s !== base;
    const db = deps.jmdict();
    const senseContext: SenseContext = {pos: tag, sentenceEnd: endsSentence(pieces, index), surface: base};

    let entry: JmdictWord | undefined;
    let alternatives: JmdictWord[] = [];
    let entries: JmdictWord[] = [];
    if (db && !user) {
      entries = await japaneseEntries(db, base);
      const ranked = rankJapaneseEntries(entries, {base, reading: inflected ? undefined : kana, context: senseContext});
      // The nominalizer ん / の before です or だ is the explanatory のです (んです) of JMdict.
      const next = pieces.slice(index + 1).find((candidate) => candidate.kind === "word");
      if (/^名詞-非自立/.test(tag) && /^[んの]$/.test(piece.s) && next && /^(です|だ|でした|だった|でしょう|だろう)/.test(next.s)) {
        const expression = (await japaneseEntries(db, `${piece.s}${/^で/.test(next.s) ? "です" : "だ"}`))
          .find((word) => word.sense.some((sense) => sense.partOfSpeech.includes("exp")));
        if (expression) entry = expression;
      }
      entry ??= ranked.find((word) => (isKana(base) ? true : word.kanji.some((kanji) => kanji.text === base)))
        ?? ranked[0];
      alternatives = ranked.filter((word) => word !== entry && word.sense.some((sense) => senseFitsPos(sense, tag) !== false));
    }

    const baseReading = entryReading(entry, base, kana, inflected);
    const pitch = pitchOf(data.pitch, base, baseReading);
    const levels = japaneseLevelFields(data.levels, {entryId: entry?.id, spelling: base, reading: baseReading});
    const pos = user ? "noun" : japanesePos(tag);
    let conjugation: object | undefined;
    if (inflected && (pos === "verb" || pos === "adjective") && entry) {
      try {
        const table = buildInflectionTable({term: piece.s, dictionaryForm: base, posTags: [...new Set(entry.sense.flatMap((sense) => sense.partOfSpeech))]}, deps.jmdictTags());
        if (table) conjugation = {dictionary_form: table.dictionaryForm, kind: table.kind, ladder: table.ladder};
      } catch {
        // No table for this word.
      }
    }

    // The tokenizer's reading against JMdict's: for an inflected word, its stem must be in the reading.
    let readingCheck: "dictionary" | "mismatch" | "unknown" = "unknown";
    let dictionaryReadings: string[] | undefined;
    const spelled = entries.filter((word) => isKana(base) ? word.kana.some((reading) => reading.text === base) : word.kanji.some((kanji) => kanji.text === base));
    if (spelled.length > 0 && kana) {
      const readings = [...new Set(spelled.flatMap((word) => word.kana.map((reading) => toHiragana(reading.text, {convertLongVowelMark: false}))))];
      const hira = toHiragana(kana, {convertLongVowelMark: false});
      const matches = inflected
        ? readings.some((reading) => reading.length > 1 && hira.includes(reading.slice(0, -1)))
        : readings.some((reading) => reading === hira || toHiragana(reading) === toHiragana(hira));
      if (matches) readingCheck = "dictionary";
      else if (!inflected) {
        readingCheck = "mismatch";
        dictionaryReadings = readings;
      }
    }

    return {
      s: piece.s, start: piece.start, end: piece.end, word: true,
      pos, ...(tag ? {tag} : {}),
      base,
      reading: {kana, romaji},
      ruby: japaneseRuby(piece.s, kana),
      gloss: user ? userGloss(user) : entry ? jmdictGloss(entry, senseContext, alternatives) : null,
      levels,
      ...(pitch ? {pitch} : {}),
      ...(conjugation ? {conjugation} : {}),
      saved: savedLevelName(levelOf(context.saved, base)),
      reading_check: readingCheck,
      ...(dictionaryReadings ? {dictionary_readings: dictionaryReadings} : {})
    };
  };

  const chineseToken = async (
    piece: Piece<any>,
    context: LanguageCallContext,
    data: StudyData,
    spoken: Map<any, Array<number | null>>
  ) => {
    const token = piece.token;
    const {info} = context;
    const cantonese = info.code === "yue";
    const field = cantonese ? "jyutping" : "pinyin";
    const parts: Array<{main: string; reading: string}> = (token.separation ?? []).map((part: any) => ({
      main: String(part?.main ?? ""),
      reading: typeof part?.[field] === "string" ? part[field] : ""
    }));
    const syllables = parts.filter((part) => /\p{Script=Han}/u.test(part.main));
    const numbered = syllables.map((part) => (cantonese ? part.reading : pinyinNumbered(part.reading)));
    const user = token.userDictionaryMeaning !== undefined ? context.userWords.get(token.origin) : undefined;
    const db = deps.chineseDictionary(cantonese ? "yue" : "zh-CN");
    const readingText = numbered.join(" ");

    let ranked: ChineseEntryView[] = [];
    let all: ChineseEntryView[] = [];
    if (db && !user) {
      all = await chineseEntries(db, piece.s);
      ranked = rankChineseEntries(all, {word: piece.s, script: info.script ?? "traditional", reading: readingText, cantonese});
    }
    const entry = ranked[0];
    let readingCheck: "dictionary" | "mismatch" | "unknown" = "unknown";
    let dictionaryReadings: string[] | undefined;
    if (all.length > 0 && readingText) {
      const listed = [...new Set(all.flatMap((candidate) => (cantonese ? candidate.jyutping.map(comparableJyutping) : candidate.pinyin.map(comparablePinyin))))].filter(Boolean);
      if (listed.length > 0) {
        if (all.some((candidate) => entryHasReading(candidate, readingText, cantonese))) readingCheck = "dictionary";
        else {
          readingCheck = "mismatch";
          dictionaryReadings = listed;
        }
      }
    }
    const hsk = cantonese ? undefined : lookupHsk(data.hsk, piece.s);
    const tones = cantonese
      ? numbered.map((syllable) => numberedTone(syllable, 6))
      : (spoken.get(token) ?? []).filter((_, at) => /\p{Script=Han}/u.test(parts[at]?.main ?? ""));
    const reading = cantonese
      ? {jyutping: readingText}
      : {pinyin: numbered.map(pinyinMarked).join(" "), pinyin_num: readingText};
    return {
      s: piece.s, start: piece.start, end: piece.end, word: true,
      pos: user ? "noun" : chinesePos(token.part),
      ...(token.part ? {tag: token.part} : {}),
      base: piece.s,
      // The word in the other script (Mandarin only: CantoDict's simplified column is sparse and Cantonese is written traditional).
      ...(entry && !cantonese && entry.simplified && entry.traditional ? {forms: {simplified: entry.simplified, traditional: entry.traditional}} : {}),
      ...(readingText ? {reading} : {}),
      ruby: chineseRuby(parts.map((part) => ({main: part.main, reading: cantonese ? part.reading : pinyinMarked(pinyinNumbered(part.reading))}))),
      gloss: user ? userGloss(user) : entry ? chineseGloss(entry, cantonese ? "CantoDict" : "CC-CEDICT", ranked.slice(1)) : null,
      levels: {...(typeof hsk === "number" ? {hsk} : {})},
      ...(tones.some((tone) => tone !== null) ? {tones} : {}),
      ...(!cantonese && numbered.length ? {tones_dictionary: numbered.map((syllable) => numberedTone(syllable, 5))} : {}),
      saved: savedLevelName(levelOf(context.saved, piece.s)),
      reading_check: readingCheck,
      ...(dictionaryReadings ? {dictionary_readings: dictionaryReadings} : {})
    };
  };

  const vietnameseToken = (piece: Piece<any>, context: LanguageCallContext) => {
    const token = piece.token;
    const key = String(token.origin ?? piece.s);
    const dictionary = deps.vietnameseDictionary();
    const user = token.userDictionaryMeaning !== undefined ? context.userWords.get(token.origin) : undefined;
    const meaning = user ? "" : dictionary?.get(key) ?? "";
    const syllables = piece.s.split(/\s+/).filter(Boolean);
    return {
      s: piece.s, start: piece.start, end: piece.end, word: true,
      pos: user ? "noun" : "word",
      base: key,
      gloss: user ? userGloss(user) : meaning ? {en: vietnameseSenses(meaning), source: "VNEDict", entry_id: key} : null,
      levels: {},
      tones: syllables.map(vietnameseTone),
      saved: savedLevelName(levelOf(context.saved, key)),
      reading_check: meaning || user ? "dictionary" : "unknown"
    };
  };

  interface StudyData {
    pitch: PitchAccentMap | null;
    levels: JapaneseLevels | null;
    hsk: HskWords | null;
  }

  const studyData = async (info: ToolLanguageInfo): Promise<StudyData> => {
    const [pitch, levels, hsk] = await Promise.all([
      info.id === "ja" ? deps.pitchAccents() : null,
      info.id === "ja" ? deps.japaneseLevels() : null,
      info.code === "zh-CN" ? deps.hskWords() : null
    ]);
    return {pitch, levels, hsk};
  };

  /** One text's tokens in full detail; their `s` join to exactly `text`. */
  const analyzeFull = async (text: string, context: LanguageCallContext, data: StudyData) => {
    if (!text) return [];
    const {info} = context;
    const tokens = await deps.analyze(info.id, text);
    const pieces = alignLanguage(info.id, text, tokens);
    const spoken = new Map<any, Array<number | null>>();
    if (info.code === "zh-CN") {
      const tones = mandarinSpokenTones(tokens);
      tokens.forEach((token, index) => spoken.set(token, tones[index]));
    }
    const result: object[] = [];
    for (const [index, piece] of pieces.entries()) {
      if (piece.kind !== "word") {
        result.push({s: piece.s, start: piece.start, end: piece.end, word: false, pos: piece.kind});
        continue;
      }
      if (!piece.token) {
        result.push({s: piece.s, start: piece.start, end: piece.end, word: true, pos: "other", base: piece.s, gloss: null, levels: {},
          saved: savedLevelName(levelOf(context.saved, piece.s)), reading_check: "unknown"});
        continue;
      }
      if (info.id === "ja") result.push(await japaneseToken(piece, pieces, index, context, data));
      else if (info.id === "vi") result.push(vietnameseToken(piece, context));
      else result.push(await chineseToken(piece, context, data, spoken));
    }
    return result;
  };

  /** The old analyze_text word shape, for any language: its words with base, reading, meaning, pos and level. */
  const analyzeBasic = async (text: string, context: LanguageCallContext, toneType: string) => {
    const {info} = context;
    const tokens = await deps.analyze(info.id, text, toneType);
    return tokens.filter((token) => typeof token?.origin === "string" && /[\p{L}\p{N}]/u.test(token.origin)).map((token) => {
      const key = wordKey(token);
      const reading = String(info.id === "ja" ? token.hiragana ?? "" : info.code === "zh-CN" ? token.pinyin ?? "" : info.code === "yue" ? token.jyutping ?? "" : "").trim();
      const meaning = info.id === "vi" ? String(token.meaning ?? "").trim() : "";
      const pos = info.id === "ja" ? String(token.pos ?? "").trim() : "";
      return {
        text: token.origin as string,
        ...(key !== token.origin ? {base: key} : {}),
        ...(reading && reading !== token.origin ? {reading} : {}),
        ...(meaning ? {meaning} : {}),
        ...(pos ? {pos} : {}),
        level: savedLevelName(levelOf(context.saved, key))
      };
    });
  };

  /**
   * analyze_text with a language, texts or detail: "full". `toneType` is the learner's setting, which
   * the basic shape's readings follow as they always did; the full shape's never do.
   */
  const analyze = async (args: Record<string, unknown>, toneType: string) => {
    const single = typeof args.text === "string";
    const texts: string[] = single ? [args.text as string] : Array.isArray(args.texts) ? args.texts as string[] : [];
    if (single && args.texts !== undefined) throw new ToolError("Give text or texts, not both.");
    if (!single && args.texts === undefined) throw new ToolError("Missing argument: text");
    if (texts.reduce((sum, text) => sum + codePoints(text), 0) > MAX_TOTAL_CHARACTERS) {
      throw new ToolError(`texts must hold at most ${MAX_TOTAL_CHARACTERS} characters in all`);
    }
    const info = await languageOf(args.language);
    const context = await callContext(info);
    const full = args.detail === "full";
    const data = full ? await studyData(info) : null;
    const results = await mapLimit(texts, LINES_AT_ONCE, new AbortController().signal, async (text) => (
      full ? {text, tokens: await analyzeFull(text, context, data!)} : {text, words: await analyzeBasic(text, context, toneType)}
    ));
    const head = {language: languageSummary(info), ...(full ? {detail: "full", format: FULL_FORMAT} : {})};
    if (single) return {...head, ...results[0]};
    return {...head, results};
  };

  // ---- lookup_word ---------------------------------------------------------------------------------------

  const JMDICT_POS: Record<string, (tag: string) => boolean> = {
    noun: (tag) => tag === "n" || tag.startsWith("n-") || tag === "vs",
    proper_noun: (tag) => tag === "n-pr",
    pronoun: (tag) => tag === "pn",
    verb: (tag) => /^v(?:1|2|4|5|k|n|r|z|s-|-unspec)/.test(tag),
    adjective: (tag) => tag.startsWith("adj"),
    adverb: (tag) => tag.startsWith("adv"),
    particle: (tag) => tag === "prt",
    auxiliary: (tag) => tag.startsWith("aux") || tag === "cop",
    conjunction: (tag) => tag === "conj",
    interjection: (tag) => tag === "int",
    numeral: (tag) => tag === "num",
    classifier: (tag) => tag === "ctr",
    prefix: (tag) => tag === "pref" || tag === "n-pref",
    suffix: (tag) => tag === "suf" || tag === "n-suf",
    expression: (tag) => tag === "exp"
  };

  const jmdictEntryView = (entry: JmdictWord, tags: Record<string, string>, data: StudyData) => {
    const firstReading = entry.kana.find((kana) => kana.common)?.text ?? entry.kana[0]?.text ?? "";
    const spelling = entry.kanji.find((kanji) => kanji.common)?.text ?? entry.kanji[0]?.text ?? firstReading;
    const pitch = entry.kana.map((kana) => pitchOf(data.pitch, spelling, kana.text)).filter(Boolean);
    return {
      entry_id: entry.id,
      source: "JMdict",
      common: [...entry.kanji, ...entry.kana].some((element) => element.common),
      spellings: entry.kanji.map((kanji) => ({text: kanji.text, common: kanji.common, tags: kanji.tags})),
      readings: entry.kana.map((kana) => ({
        text: kana.text, romaji: toRomaji(kana.text), common: kana.common, tags: kana.tags,
        applies_to_spellings: kana.appliesToKanji
      })),
      senses: entry.sense.map((sense) => ({
        pos: sense.partOfSpeech,
        pos_names: sense.partOfSpeech.map((tag) => tags[tag] ?? tag),
        gloss: sense.gloss.map((gloss) => gloss.text),
        ...(sense.misc.length ? {misc: sense.misc} : {}),
        ...(sense.field.length ? {field: sense.field} : {}),
        ...(sense.dialect.length ? {dialect: sense.dialect} : {}),
        ...(sense.info.length ? {info: sense.info} : {}),
        ...(sense.appliesToKanji.length && !sense.appliesToKanji.includes("*") ? {applies_to_spellings: sense.appliesToKanji} : {}),
        ...(sense.appliesToKana.length && !sense.appliesToKana.includes("*") ? {applies_to_readings: sense.appliesToKana} : {}),
        ...(sense.related.length ? {related: sense.related.map((xref) => xref.filter((part) => typeof part === "string").join("・"))} : {}),
        ...(sense.antonym.length ? {antonyms: sense.antonym.map((xref) => xref.filter((part) => typeof part === "string").join("・"))} : {})
      })),
      levels: japaneseLevelFields(data.levels, {entryId: entry.id, spelling, reading: firstReading}),
      ...(pitch.length ? {pitch} : {})
    };
  };

  const chineseEntryView = (entry: ChineseEntryView, source: string, hsk: HskWords | null, cantonese: boolean) => ({
    entry_id: entry.id,
    source,
    traditional: entry.traditional,
    simplified: entry.simplified,
    ...(entry.traditionalForms.length > 1 || entry.simplifiedForms.length > 1 ? {forms: {traditional: entry.traditionalForms, simplified: entry.simplifiedForms}} : {}),
    ...(entry.pinyin.length ? {pinyin: entry.pinyin.map((reading) => ({pinyin_num: reading, pinyin: reading.split(/\s+/).map((syllable) => pinyinMarked(pinyinNumbered(syllable))).join(" ")}))} : {}),
    ...(entry.jyutping.length ? {jyutping: entry.jyutping} : {}),
    senses: entry.senses,
    ...(entry.measureWords.length ? {measure_words: entry.measureWords} : {}),
    ...(entry.references.length ? {references: entry.references} : {}),
    ...(entry.standardChinese ? {standard_chinese: entry.standardChinese} : {}),
    ...(entry.notes.length ? {notes: entry.notes} : {}),
    ...(entry.surname ? {surname: true} : {}),
    ...(entry.properNoun ? {proper_noun: true} : {}),
    levels: {...(!cantonese && typeof lookupHsk(hsk, entry.simplified) === "number" ? {hsk: lookupHsk(hsk, entry.simplified)} : {})}
  });

  const userEntryView = (entry: UserDictionaryEntry) => ({
    entry_id: `user:${entry.language}:${entry.surface}`,
    source: "Your dictionary",
    user_source: entry.source,
    word: entry.surface,
    reading: entry.reading,
    senses: [entry.meaning]
  });

  const lookup_word = async (args: Record<string, unknown>) => {
    const word = String(args.word).trim().normalize("NFC");
    if (!word) throw new ToolError("word must not be empty");
    const info = await languageOf(args.language);
    const reading = typeof args.reading === "string" ? args.reading.trim() : "";
    const pos = typeof args.pos === "string" ? args.pos : "";
    const limit = args.limit as number;
    const user = (await deps.userWords(info.code).catch(() => [])).find((entry) => entry.surface === word);
    const head = {language: languageSummary(info), word};

    if (info.id === "ja") {
      const db = deps.jmdict();
      if (!db) throw new ToolError("Japanese isn't loaded: its dictionary is not open.", 409);
      const data = await studyData(info);
      let entries = await japaneseEntries(db, word);
      let dictionaryForm: string | undefined;
      if (entries.length === 0) {
        // An inflected form: look up the dictionary form Miteiru's tokenizer gives it.
        const tokens = await deps.analyze("ja", word);
        const words = tokens.filter((token) => /[\p{L}\p{N}]/u.test(String(token?.origin ?? "")));
        if (words.length === 1 && wordKey(words[0]) !== word) {
          dictionaryForm = wordKey(words[0]);
          entries = await japaneseEntries(db, dictionaryForm);
        }
      }
      const kana = reading ? toHiragana(reading, {convertLongVowelMark: false}) : "";
      if (kana) entries = entries.filter((entry) => entry.kana.some((candidate) => toHiragana(candidate.text) === toHiragana(kana)));
      const fits = JMDICT_POS[pos];
      if (fits) entries = entries.filter((entry) => entry.sense.some((sense) => sense.partOfSpeech.some(fits)));
      const ranked = rankJapaneseEntries(entries, {base: dictionaryForm ?? word, reading: kana || undefined, context: {}});
      const tags = deps.jmdictTags();
      return {
        ...head,
        ...(dictionaryForm ? {dictionary_form: dictionaryForm} : {}),
        total: ranked.length + (user ? 1 : 0),
        entries: [...(user ? [userEntryView(user)] : []), ...ranked.slice(0, limit).map((entry) => jmdictEntryView(entry, tags, data))]
      };
    }

    if (info.id === "vi") {
      const dictionary = deps.vietnameseDictionary();
      if (!dictionary) throw new ToolError("Vietnamese isn't loaded: its dictionary is not open.", 409);
      const keys = [...new Set([word, word.charAt(0).toLowerCase() + word.slice(1), word.toLowerCase()])].filter((key) => dictionary.has(key));
      return {
        ...head,
        total: keys.length + (user ? 1 : 0),
        entries: [...(user ? [userEntryView(user)] : []), ...keys.slice(0, limit).map((key) => ({
          entry_id: key, source: "VNEDict", word: key, senses: vietnameseSenses(dictionary.get(key) ?? "")
        }))]
      };
    }

    const cantonese = info.code === "yue";
    const db = deps.chineseDictionary(cantonese ? "yue" : "zh-CN");
    if (!db) throw new ToolError(`${info.name} isn't loaded: its dictionary is not open.`, 409);
    let entries = await chineseEntries(db, word);
    if (reading) entries = entries.filter((entry) => entryHasReading(entry, reading, cantonese));
    const ranked = rankChineseEntries(entries, {word, script: info.script ?? "traditional", reading: reading || undefined, cantonese});
    const hsk = cantonese ? null : await deps.hskWords();
    return {
      ...head,
      total: ranked.length + (user ? 1 : 0),
      entries: [...(user ? [userEntryView(user)] : []), ...ranked.slice(0, limit).map((entry) => chineseEntryView(entry, cantonese ? "CantoDict" : "CC-CEDICT", hsk, cantonese))]
    };
  };

  // ---- lookup_character ------------------------------------------------------------------------------------

  /** Each <path>'s d, in document order; the stroke files are minified, so values may be unquoted (d=M24.99,14c…). */
  const svgPaths = (svg: string, filter: (attributes: string) => boolean = () => true): string[] => {
    const paths: string[] = [];
    for (const match of svg.matchAll(/<path\b([^>]*)>/g)) {
      const attributes = match[1];
      const d = attributes.match(/\sd=(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/);
      const value = d ? d[1] ?? d[2] ?? d[3] : undefined;
      if (value && filter(attributes)) paths.push(value);
    }
    return paths;
  };

  const lookup_character = async (args: Record<string, unknown>) => {
    const characters = Array.from(String(args.char).trim().normalize("NFC"));
    if (characters.length !== 1 || !/\p{Script=Han}/u.test(characters[0])) throw new ToolError("char must be one Han character (a kanji or hanzi)");
    const info = await languageOf(args.language);
    const char = characters[0];
    const codepoint = char.codePointAt(0)!;
    const head = {language: languageSummary(info), char, codepoint: `U+${codepoint.toString(16).toUpperCase().padStart(4, "0")}`};

    if (info.id === "ja") {
      const db = deps.kanjidic();
      if (!db) throw new ToolError("Japanese isn't loaded: KANJIDIC is not open.", 409);
      const raw = await db.get(`raw/characters/${char}`);
      const entry = raw ? JSON.parse(raw) : null;
      const svg = await deps.strokeSvg("kanji", char);
      const strokes = svg ? svgPaths(svg) : [];
      if (!entry && strokes.length === 0) throw new ToolError(`KANJIDIC has no entry for ${char}.`, 404);
      const groups: any[] = entry?.readingMeaning?.groups ?? [];
      const readings = (type: string) => groups.flatMap((group) => (group.readings ?? []).filter((reading: any) => reading.type === type).map((reading: any) => reading.value));
      const meanings = groups.flatMap((group) => (group.meanings ?? []).filter((meaning: any) => meaning.lang === "en").map((meaning: any) => meaning.value));
      const misc = entry?.misc ?? {};
      return {
        ...head,
        source: "KANJIDIC2",
        found: Boolean(entry),
        readings: {on: readings("ja_on"), kun: readings("ja_kun"), nanori: entry?.readingMeaning?.nanori ?? [], pinyin: readings("pinyin"), korean: readings("korean_h")},
        meanings,
        levels: {
          ...(typeof misc.grade === "number" ? {grade: misc.grade} : {}),
          // KANJIDIC2 keeps the four levels of the JLPT before 2010 (4 easiest).
          ...(typeof misc.jlptLevel === "number" ? {jlpt_old: misc.jlptLevel} : {}),
          ...(typeof misc.frequency === "number" ? {freq_rank: misc.frequency} : {})
        },
        stroke_count: Array.isArray(misc.strokeCounts) ? misc.strokeCounts[0] ?? null : null,
        radical: (entry?.radicals ?? []).find((radical: any) => radical.type === "classical")?.value ?? null,
        strokes: {source: "KanjiVG", count: strokes.length, paths: strokes}
      };
    }

    if (info.id === "vi") throw new ToolError("lookup_character is for Japanese, Mandarin and Cantonese.");
    const cantonese = info.code === "yue";
    const db = deps.chineseDictionary(cantonese ? "yue" : "zh-CN");
    if (!db) throw new ToolError(`${info.name} isn't loaded: its dictionary is not open.`, 409);
    const ids = await db.values({gte: `indexchar/${char}-`, lt: `indexchar/${char}-\u{10FFFF}`, limit: -1}).all();
    const rawEntries = (await db.getMany(ids.map((id) => `raw/char/${id}`))).filter((value): value is string => typeof value === "string").map((value) => JSON.parse(value));
    const svg = await deps.strokeSvg("hanzi", char);
    // Make Me a Hanzi: each stroke's outline is drawn twice (a grey path and a clip path), its median once.
    const outlines = svg ? svgPaths(svg, (attributes) => /fill="lightgray"/.test(attributes)) : [];
    const medians = svg ? svgPaths(svg, (attributes) => /stroke-dasharray/.test(attributes)) : [];
    if (rawEntries.length === 0 && outlines.length === 0) throw new ToolError(`The ${cantonese ? "CantoDict" : "CC-CEDICT"} character list has no entry for ${char}.`, 404);
    const first = rawEntries[0] ?? {};
    const hsk = cantonese ? undefined : lookupHsk(await deps.hskWords(), char);
    const strings = (value: unknown) => (Array.isArray(value) ? value : value ? [value] : []).filter((item): item is string => typeof item === "string" && item !== "");
    // The character lists write pinyin with tone marks; the tools give both forms, as everywhere else.
    const pinyinNumbers = [...new Set((await pinyinToNumbersBatch(rawEntries.flatMap((entry) => strings(entry.pinyin)))).filter(Boolean))];
    const jyutping = [...new Set(rawEntries.flatMap((entry) => strings(entry.jyutping)).map(comparableJyutping).filter(Boolean))];
    return {
      ...head,
      source: cantonese ? "CantoDict" : "CC-CEDICT",
      found: rawEntries.length > 0,
      readings: {
        ...(pinyinNumbers.length ? {pinyin: pinyinNumbers.map((reading) => reading.split(" ").map(pinyinMarked).join(" ")), pinyin_num: pinyinNumbers} : {}),
        ...(jyutping.length ? {jyutping} : {})
      },
      meanings: rawEntries.flatMap((entry) => strings(entry.meaning)),
      ...(rawEntries.some((entry) => strings(entry.notes).length) ? {notes: rawEntries.flatMap((entry) => strings(entry.notes))} : {}),
      decomposition: first.decomposition || null,
      radical: first.radical || null,
      ...(first.etymology && Object.values(first.etymology).some(Boolean) ? {etymology: first.etymology} : {}),
      stroke_count: typeof first.stroke_count === "number" ? first.stroke_count : (outlines.length || null),
      variants: strings(first.variants),
      levels: {...(typeof hsk === "number" ? {hsk} : {})},
      strokes: {source: "Make Me a Hanzi", count: outlines.length, outlines, medians}
    };
  };

  // ---- readings ------------------------------------------------------------------------------------------

  const readings = async (args: Record<string, unknown>) => {
    const word = String(args.word).trim().normalize("NFC");
    if (!word) throw new ToolError("word must not be empty");
    const info = await languageOf(args.language);
    const head = {language: languageSummary(info), word};
    const tokens = await deps.analyze(info.id, word);
    const tokenized = tokens.map((token) => String(info.id === "ja" ? token.hiragana ?? "" : info.code === "yue" ? token.jyutping ?? "" : token.pinyin ?? "")).join(" ").trim();

    if (info.id === "ja") {
      const db = deps.jmdict();
      if (!db) throw new ToolError("Japanese isn't loaded: its dictionary is not open.", 409);
      const data = await studyData(info);
      const entries = rankJapaneseEntries(await japaneseEntries(db, word), {base: word, context: {}});
      const found: Array<{reading: string; romaji: string; common: boolean; entry_ids: string[]; pitch?: object}> = [];
      for (const entry of entries) {
        for (const kana of entry.kana) {
          if (!kana.appliesToKanji.includes("*") && !kana.appliesToKanji.includes(word) && !isKana(word)) continue;
          if (isKana(word) && toHiragana(kana.text) !== toHiragana(word) && entry.kanji.length > 0) continue;
          const reading = toHiragana(kana.text, {convertLongVowelMark: false});
          const existing = found.find((item) => item.reading === reading);
          if (existing) {
            existing.common ||= kana.common;
            if (!existing.entry_ids.includes(entry.id)) existing.entry_ids.push(entry.id);
            continue;
          }
          const pitch = pitchOf(data.pitch, word, reading);
          found.push({reading, romaji: toRomaji(reading), common: kana.common, entry_ids: [entry.id], ...(pitch ? {pitch: {accents: pitch.accents, patterns: pitch.patterns}} : {})});
        }
      }
      return {...head, source: "JMdict", tokenizer_reading: toHiragana(tokenized, {convertLongVowelMark: false}), readings: found};
    }
    if (info.id === "vi") throw new ToolError("readings is for Japanese, Mandarin and Cantonese: Vietnamese is written as it is read.");

    const cantonese = info.code === "yue";
    const db = deps.chineseDictionary(cantonese ? "yue" : "zh-CN");
    if (!db) throw new ToolError(`${info.name} isn't loaded: its dictionary is not open.`, 409);
    const entries = rankChineseEntries(await chineseEntries(db, word), {word, script: info.script ?? "traditional", cantonese});
    // One item per distinct reading, in the ranked entries' order (a Map keeps insertion order).
    const found = new Map<string, Record<string, unknown> & {entry_ids: string[]}>();
    for (const entry of entries) {
      for (const reading of cantonese ? entry.jyutping : entry.pinyin) {
        const key = cantonese ? comparableJyutping(reading) : comparablePinyin(reading);
        if (!key) continue;
        const existing = found.get(key);
        if (existing) {
          if (!existing.entry_ids.includes(entry.id)) existing.entry_ids.push(entry.id);
          continue;
        }
        found.set(key, {
          ...(cantonese ? {jyutping: key} : {pinyin_num: key, pinyin: key.split(" ").map(pinyinMarked).join(" ")}),
          entry_ids: [entry.id],
          sense: shortSense(entry.senses[0] ?? entry.references[0] ?? "")
        });
      }
    }
    const tokenizerReading = cantonese ? tokenized : tokenized.split(/\s+/).map(pinyinNumbered).join(" ");
    return {
      ...head,
      source: cantonese ? "CantoDict" : "CC-CEDICT",
      tokenizer_reading: cantonese ? tokenizerReading : {pinyin_num: tokenizerReading, pinyin: tokenizerReading.split(" ").map(pinyinMarked).join(" ")},
      readings: [...found.values()]
    };
  };

  // ---- text_coverage ---------------------------------------------------------------------------------------

  const text_coverage = async (args: Record<string, unknown>) => {
    const info = await languageOf(args.language);
    const texts = args.texts as string[];
    if (texts.reduce((sum, text) => sum + codePoints(text), 0) > MAX_TOTAL_CHARACTERS) {
      throw new ToolError(`texts must hold at most ${MAX_TOTAL_CHARACTERS} characters in all`);
    }
    const limit = args.limit as number;
    const context = await callContext(info);
    const data = await studyData(info);
    const lines = await mapLimit(texts, LINES_AT_ONCE, new AbortController().signal, (text) => (text ? deps.analyze(info.id, text) : Promise.resolve([])));
    const lemmas = new Map<string, {count: number; level: SavedLevel; reading?: string}>();
    let counted = 0;
    const byLevel = {new: 0, learning: 0, known: 0};
    for (const line of lines) {
      for (const token of line) {
        const key = wordKey(token);
        if (!/\p{L}/u.test(key) || !isCountedWord(token)) continue;
        counted++;
        let stats = lemmas.get(key);
        if (!stats) {
          stats = {count: 0, level: savedLevelName(levelOf(context.saved, key))};
          lemmas.set(key, stats);
        }
        stats.count++;
        byLevel[stats.level]++;
        if (!stats.reading) {
          const reading = info.id === "ja" ? (token.origin === key ? token.hiragana : undefined)
            : info.code === "zh-CN" ? String(token.pinyin ?? "").split(/\s+/).map(pinyinNumbered).join(" ") : token.jyutping;
          if (typeof reading === "string" && reading.trim() && reading !== key) stats.reading = reading.trim();
        }
      }
    }
    const percent = (count: number) => (counted ? Math.round(count / counted * 1000) / 10 : 0);
    const distinct = {new: 0, learning: 0, known: 0};
    for (const stats of lemmas.values()) distinct[stats.level]++;
    const sorted = [...lemmas.entries()].sort((a, b) => b[1].count - a[1].count);
    const levelsFor = (word: string, reading?: string) => {
      if (info.id === "ja") {
        return japaneseLevelFields(data.levels, {spelling: word, reading});
      }
      const hsk = info.code === "zh-CN" ? lookupHsk(data.hsk, word) : undefined;
      return typeof hsk === "number" ? {hsk} : {};
    };
    return {
      language: languageSummary(info),
      texts: texts.length,
      words: {counted, distinct: lemmas.size},
      coverage: {known: percent(byLevel.known), learning: percent(byLevel.learning), known_or_learning: percent(byLevel.known + byLevel.learning), new: percent(byLevel.new)},
      lemmas: {new: distinct.new, learning: distinct.learning, known: distinct.known},
      unknown_words: sorted.filter(([, stats]) => stats.level === "new").slice(0, limit).map(([word, stats]) => ({
        word, ...(stats.reading ? {reading: stats.reading} : {}), count: stats.count, levels: levelsFor(word, stats.reading)
      })),
      by_lemma: sorted.slice(0, 5000).map(([word, stats]) => ({word, count: stats.count, saved: stats.level})),
      ...(info.id === "ja" ? {note: "Particles, auxiliary verbs, prefixes (お, ご), grammatical nouns (の, こと, よう), name suffixes (さん), interjections and fillers are not counted."} : {})
    };
  };

  // ---- known_words and set_word_levels ---------------------------------------------------------------------

  const known_words = async (args: Record<string, unknown>) => {
    const info = await languageOf(args.language);
    const saved = await deps.savedWords(info.code);
    const level = args.level as "learning" | "known" | "all";
    const limit = args.limit as number;
    const offset = args.offset as number;
    const wanted = (stored: number) => (level === "all" ? stored === 1 || stored === 2 : level === "known" ? stored === 2 : stored === 1);
    const matching = Object.entries(saved)
      .filter(([, entry]) => wanted(entry.level))
      .sort((a, b) => (b[1].updTime ?? 0) - (a[1].updTime ?? 0) || (a[0] < b[0] ? -1 : 1));
    const page = matching.slice(offset, offset + limit);
    const total = {learning: 0, known: 0};
    for (const entry of Object.values(saved)) {
      if (entry.level === 1) total.learning++;
      else if (entry.level === 2) total.known++;
    }
    return {
      language: languageSummary(info),
      total,
      count: page.length,
      ...(offset + page.length < matching.length ? {next_offset: offset + page.length} : {}),
      words: page.map(([word, entry]) => ({
        word,
        level: savedLevelName(entry.level),
        ...(entry.updTime > 0 ? {updated_ms: entry.updTime, updated: new Date(entry.updTime).toISOString()} : {})
      }))
    };
  };

  const LEVEL_NUMBERS: Record<SavedLevel, number> = {new: 0, learning: 1, known: 2};

  const set_word_levels = async (args: Record<string, unknown>) => {
    const requested = args.words as Array<{word: string; level: SavedLevel}>;
    const words = new Map<string, SavedLevel>();
    for (const [index, item] of requested.entries()) {
      const word = item.word.trim().normalize("NFC");
      if (!/[\p{L}\p{N}]/u.test(word)) throw new ToolError(`words[${index}].word must hold a letter or digit`);
      words.set(word, item.level);
    }
    const info = await languageOf(args.language);
    const before = await deps.savedWords(info.code);
    const time = now();
    const entries: SavedWords = {};
    for (const [word, level] of words) entries[word] = {level: LEVEL_NUMBERS[level], updTime: time};
    await deps.saveWordLevels(info.code, entries);
    return {
      language: languageSummary(info),
      updated: words.size,
      words: [...words].map(([word, level]) => ({word, level, previous: savedLevelName(levelOf(before, word))}))
    };
  };

  // ---- conjugate -----------------------------------------------------------------------------------------

  const conjugate = async (args: Record<string, unknown>) => {
    const word = String(args.word).trim().normalize("NFC");
    if (!word) throw new ToolError("word must not be empty");
    if (args.language !== undefined && args.language !== "ja") throw new ToolError("conjugate is for Japanese.");
    const info = await languageOf("ja");
    const db = deps.jmdict();
    if (!db) throw new ToolError("Japanese isn't loaded: its dictionary is not open.", 409);
    let dictionaryForm = word;
    let entries = (await japaneseEntries(db, word)).filter((entry) => entry.sense.some((sense) => sense.partOfSpeech.some((tag) => JMDICT_POS.verb(tag) || JMDICT_POS.adjective(tag))));
    if (entries.length === 0) {
      const tokens = await deps.analyze("ja", word);
      const words = tokens.filter((token) => /[\p{L}\p{N}]/u.test(String(token?.origin ?? "")));
      if (words.length === 1) {
        dictionaryForm = wordKey(words[0]);
        entries = (await japaneseEntries(db, dictionaryForm)).filter((entry) => entry.sense.some((sense) => sense.partOfSpeech.some((tag) => JMDICT_POS.verb(tag) || JMDICT_POS.adjective(tag))));
      }
    }
    const entry = rankJapaneseEntries(entries, {base: dictionaryForm, context: {}})[0];
    if (!entry) throw new ToolError(`${word} is not a verb or adjective JMdict knows.`, 404);
    const posTags = [...new Set(entry.sense.flatMap((sense) => sense.partOfSpeech))];
    const table = buildInflectionTable({term: word, dictionaryForm, posTags}, deps.jmdictTags());
    if (!table) throw new ToolError(`${word} has no conjugation table.`, 404);
    return {
      language: languageSummary(info),
      word,
      dictionary_form: table.dictionaryForm,
      reading: entry.kana.find((kana) => kana.common)?.text ?? entry.kana[0]?.text ?? null,
      kind: table.kind,
      entry_id: entry.id,
      pos: posTags,
      is_inflected: table.isInflected,
      ladder: table.ladder,
      forms: table.rows.map((row) => ({id: row.id, label: row.label, forms: row.forms, use: row.useHint, essential: row.essential}))
    };
  };

  // ---- romanize ----------------------------------------------------------------------------------------

  const ASCII_PUNCTUATION: Record<string, string> = {"，": ",", "、": ",", "。": ".", "！": "!", "？": "?", "：": ":", "；": ";", "「": "\"", "」": "\"", "『": "\"", "』": "\"", "（": "(", "）": ")", "　": " ", "～": "~", "…": "..."};

  const romanize = async (args: Record<string, unknown>) => {
    const info = await languageOf(args.language);
    const text = String(args.text);
    const head = {language: languageSummary(info), text};
    if (info.id === "vi") return {...head, system: "Vietnamese without diacritics", romanized: stripVietnamese(text)};
    const tokens = await deps.analyze(info.id, text);
    const pieces = alignTokens(text, tokens, (token) => String(token?.origin ?? ""));
    const romanizedPieces = pieces.map((piece) => {
      if (piece.kind !== "word" || !piece.token) return {s: piece.s, romanized: piece.s.replace(/./gu, (char) => ASCII_PUNCTUATION[char] ?? char), word: piece.kind === "word"};
      const token = piece.token;
      if (info.id === "ja") {
        const romaji = (token.separation ?? []).map((part: any) => part?.romaji ?? "").join("") || toRomaji(token.hiragana ?? piece.s);
        return {s: piece.s, romanized: romaji, word: true};
      }
      const field = info.code === "yue" ? "jyutping" : "pinyin";
      const syllables = (token.separation ?? []).map((part: any) => {
        const reading = typeof part?.[field] === "string" && part[field] ? part[field] : "";
        if (!reading) return String(part?.main ?? "");
        return info.code === "yue" ? reading : pinyinMarked(pinyinNumbered(reading));
      });
      return {s: piece.s, romanized: info.code === "yue" ? syllables.join(" ") : syllables.join(""), word: true};
    });
    // Words get a space between them; punctuation keeps to the word before it.
    let romanized = "";
    for (const piece of romanizedPieces) {
      if (piece.word) {
        if (romanized && !/[\s([{"']$/.test(romanized)) romanized += " ";
        romanized += piece.romanized;
      } else if (/^\s+$/.test(piece.romanized)) {
        if (romanized && !/\s$/.test(romanized)) romanized += " ";
      } else {
        romanized += piece.romanized;
      }
    }
    return {
      ...head,
      system: info.id === "ja" ? "Hepburn (wanakana, long vowels spelled out)" : info.code === "yue" ? "Jyutping" : "Hanyu Pinyin with tone marks",
      romanized: romanized.trim(),
      tokens: romanizedPieces.map(({s, romanized: value}) => ({s, romanized: value}))
    };
  };

  /** Miteiru's own tokens in a named language (rate_video with a language), its engine loaded first. */
  const analyzeRaw = async (language: ToolLanguage, text: string) => {
    await deps.ensureLanguage(language);
    return deps.analyze(language, text);
  };

  return {analyze, analyzeRaw, lookup_word, lookup_character, readings, text_coverage, known_words, set_word_levels, conjugate, romanize, languageOf};
};

export type LanguageTools = ReturnType<typeof createLanguageTools>;

export type {RubySegment};
