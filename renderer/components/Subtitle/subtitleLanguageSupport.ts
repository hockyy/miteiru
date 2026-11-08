import {isHiragana, isKatakana} from "wanakana";
import {languageCodes} from "../../languages/manifest";
import {escapeHtml} from "../../utils/html";
import type {Line, SubtitleContainer} from "./DataStructures";

export type TokenizeMiteiru = (text: string) => Promise<any[]>;

/** A word to gloss (main's LearningGlossRequest): dictionary form plus, for Japanese, its reading. */
interface LearningLookup {
  target: string;
  reading?: string;
}

interface SubtitleLanguageSupport {
  // IPC channel answering a batch of lookups with one short gloss each.
  glossChannel: string;
  // The word a token counts as in the subtitle's frequency table.
  frequencyKey: (token: any) => string;
  // What to look up for a token, or null for words that get no gloss.
  lookup: (token: any) => LearningLookup | null;
}

// Languages whose words are counted and looked up by their surface form.
const surfaceFormSupport = (glossChannel: string): SubtitleLanguageSupport => ({
  glossChannel,
  frequencyKey: (token) => token.origin,
  lookup: (token) => (token.origin ? {target: token.origin} : null)
});

const subtitleLanguageSupportByLang: Record<string, SubtitleLanguageSupport> = {
  [languageCodes.japanese]: {
    glossChannel: "learningGlossesJapanese",
    frequencyKey: (token) => token.basicForm,
    lookup: (token) => {
      const target = token.basicForm;
      if (!target || target === "*") return null;
      // Short kana words are particles and auxiliaries: no gloss.
      if ((isHiragana(target) || isKatakana(target)) && target.length <= 3) return null;
      return {target, reading: token.hiragana ?? ""};
    }
  },
  [languageCodes.mandarin]: surfaceFormSupport("learningGlossesChinese"),
  [languageCodes.cantonese]: surfaceFormSupport("learningGlossesChinese"),
  [languageCodes.vietnamese]: surfaceFormSupport("learningGlossesVietnamese")
};

export const getSubtitleLanguageSupport = (language: string) => subtitleLanguageSupportByLang[language];

export const isLearningSubtitleLanguage = (language: string) => Boolean(getSubtitleLanguageSupport(language));

// Glosses already fetched during one subtitle's processing, by target and reading.
type GlossCache = Map<string, string>;

const glossKey = ({target, reading = ""}: LearningLookup) => `${target}\u0000${reading}`;

// A dictionary refresh invalidates older work before its replacement is ready. All learning paths
// share this guard, including an initial subtitle analysis that is still running in the background.
const lineRevisions = new WeakMap<Line, number>();
const countedLines = new WeakMap<Map<string, number>, WeakMap<Line, Map<string, number>>>();

export interface AiSubtitleRetokenization {
  from: number;
  to: number;
  text: string;
  tokens: any[];
}

type AiLineAnalysis = {fingerprint: string; tokens: any[]};
const aiLineAnalysis = new WeakMap<Line, AiLineAnalysis>();
const comparableText = (text: string) => text.normalize('NFC').replace(/\s+/gu, '');
const copyTokens = (tokens: readonly any[]) => tokens.map((token) => ({...token,
  ...(Array.isArray(token.separation) ? {separation: token.separation.map((part) => ({...part}))} : {})}));

/** Manual definitions win; contextual AI glosses otherwise describe this occurrence of the word. */
const suppliedMeaning = (token: any): string | undefined => {
  if (token.userDictionarySource === 'manual' && typeof token.userDictionaryMeaning === 'string') return token.userDictionaryMeaning;
  if (typeof token.contextMeaning === 'string') return token.contextMeaning;
  if (typeof token.userDictionaryMeaning === 'string' && token.userDictionaryMeaning) return token.userDictionaryMeaning;
  return token.aiRetokenized ? '' : undefined;
};

/** Preserve AI boundaries while replacing stale dictionary provenance with the current overlay. */
const withCurrentDictionary = (tokens: readonly any[], current: readonly any[], removeStale = false) => {
  const overrides = new Map(current.filter((token) => token?.userDictionaryId || token?.userDictionaryMeaning)
    .map((token) => [token.origin, token]));
  return copyTokens(tokens).map((token) => {
    const custom = overrides.get(token.origin);
    if (removeStale) for (const key of Object.keys(token)) if (key.startsWith('userDictionary')) delete token[key];
    return custom ? {...token, ...custom, contextMeaning: token.contextMeaning, aiRetokenized: true, origin: token.origin} : token;
  });
};

export const invalidateLearningLines = (lines: readonly Line[]) => {
  for (const line of lines) lineRevisions.set(line, (lineRevisions.get(line) ?? 0) + 1);
};

/** Drop cues replaced by newly merged transcription boundaries, including any work still in flight. */
export const releaseLearningLines = (lines: readonly Line[], frequency: Map<string, number>) => {
  invalidateLearningLines(lines);
  const counted = countedLines.get(frequency);
  for (const line of lines) {
    for (const [word, count] of counted?.get(line) ?? []) {
      const remaining = (frequency.get(word) ?? 0) - count;
      if (remaining > 0) frequency.set(word, remaining);
      else frequency.delete(word);
    }
    counted?.delete(line);
  }
};

const commitLineFrequency = (line: Line, tokens: any[], support: SubtitleLanguageSupport, frequency: Map<string, number>) => {
  let counted = countedLines.get(frequency);
  if (!counted) {
    counted = new WeakMap();
    countedLines.set(frequency, counted);
  }
  for (const [word, count] of counted.get(line) ?? []) {
    const remaining = (frequency.get(word) ?? 0) - count;
    if (remaining > 0) frequency.set(word, remaining);
    else frequency.delete(word);
  }
  const next = new Map<string, number>();
  for (const token of tokens) {
    const word = support.frequencyKey(token);
    next.set(word, (next.get(word) ?? 0) + 1);
  }
  for (const [word, count] of next) frequency.set(word, (frequency.get(word) ?? 0) + count);
  counted.set(line, next);
};

/** Apply validated cue analyses together, without waiting on another tokenizer or gloss request. */
export const applyAiSubtitleRetokenizations = (subtitle: SubtitleContainer, analyses: readonly AiSubtitleRetokenization[]): number => {
  const support = getSubtitleLanguageSupport(subtitle.language);
  if (!support || !analyses.length || !subtitle.lines.length) return 0;
  let changed = 0;
  for (const analysis of analyses) {
    if (!analysis || !Number.isFinite(analysis.from) || !Number.isFinite(analysis.to) || analysis.to <= analysis.from
      || typeof analysis.text !== 'string' || !Array.isArray(analysis.tokens) || !analysis.tokens.length || analysis.tokens.length > 500) continue;
    const text = comparableText(analysis.text);
    if (!text || analysis.tokens.some((token) => !token || typeof token.origin !== 'string')
      || comparableText(analysis.tokens.map((token) => token.origin).join('')) !== text) continue;
    // The forecast can clip a long cue to its context window. It still must belong to exactly
    // this live line, with identical text; a result from a replaced transcript cannot apply.
    let low = 0;
    let high = subtitle.lines.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (subtitle.lines[middle].timeStart <= analysis.from + 1) low = middle;
      else high = middle - 1;
    }
    const line = subtitle.lines[low];
    if (line.timeStart > analysis.from + 1 || line.timeEnd + 1 < analysis.to || comparableText(line.text) !== text) continue;
    const fingerprint = JSON.stringify(analysis.tokens);
    if (aiLineAnalysis.get(line)?.fingerprint === fingerprint) continue;
    const tokens = withCurrentDictionary(analysis.tokens, Array.isArray(line.content) ? line.content : [])
      .map((token) => ({...token, aiRetokenized: true}));
    aiLineAnalysis.set(line, {fingerprint, tokens: copyTokens(analysis.tokens).map((token) => ({...token, aiRetokenized: true}))});
    invalidateLearningLines([line]);
    commitLineFrequency(line, tokens, support, subtitle.frequency);
    line.content = tokens;
    line.meaning = tokens.map((token) => suppliedMeaning(token) ?? '');
    changed++;
  }
  if (changed) subtitle.notifyChanged();
  return changed;
};

/** Turning the AI overlay off returns only its affected cues to ordinary analysis. */
export const clearAiSubtitleRetokenizations = (subtitle: SubtitleContainer): Line[] => {
  const affected = subtitle.lines.filter((line) => aiLineAnalysis.has(line));
  for (const line of affected) aiLineAnalysis.delete(line);
  invalidateLearningLines(affected);
  return affected;
};

/**
 * Fills draft lines' glosses with one IPC call for all words not
 * yet in `cache`. Subtitles repeat words constantly, so most chunks need few or no lookups.
 */
const fillLearningContent = async (
  lines: Line[],
  support: SubtitleLanguageSupport,
  cache: GlossCache
) => {
  const requests: LearningLookup[] = [];
  const requested = new Set<string>();
  // Each line's glosses, assigned in one go at the end: subtitle views notice a new array, not edits.
  const meanings = new Map<Line, string[]>();
  const slots: { meaning: string[]; index: number; key: string }[] = [];

  for (const line of lines) {
    if (!Array.isArray(line.content)) continue;
    const meaning = Array(line.content.length).fill("");
    meanings.set(line, meaning);
    line.content.forEach((token, index) => {
      const supplied = suppliedMeaning(token);
      if (supplied !== undefined) {
        meaning[index] = supplied;
        return;
      }
      const lookup = support.lookup(token);
      if (!lookup) return;
      const key = glossKey(lookup);
      slots.push({meaning, index, key});
      if (cache.has(key) || requested.has(key)) return;
      requested.add(key);
      requests.push(lookup);
    });
  }

  if (requests.length > 0) {
    let glosses: unknown;
    try {
      glosses = await window.backend.invoke(support.glossChannel, requests);
    } catch (error) {
      console.error("[learning] gloss lookup failed:", error);
    }
    // A failed or empty reply (dictionary still opening) is not cached, so later chunks ask again.
    if (Array.isArray(glosses) && glosses.length === requests.length) {
      requests.forEach((lookup, index) => cache.set(glossKey(lookup), String(glosses[index] ?? "")));
    }
  }
  for (const {meaning, index, key} of slots) meaning[index] = cache.get(key) ?? "";
  for (const [line, meaning] of meanings) line.meaning = meaning;
};

const fillLearningLines = async (
  lines: readonly Line[],
  support: SubtitleLanguageSupport,
  tokenizeMiteiru: TokenizeMiteiru,
  frequency: Map<string, number>,
  cache: GlossCache,
  shouldContinue: () => boolean,
  force: boolean,
  shouldIncludeLine: (line: Line) => boolean = () => true
) => {
  if (!shouldContinue()) return false;
  const work = lines.filter((line) => shouldIncludeLine(line) && (force || !Array.isArray(line.content))).map((line) => {
    const revision = (lineRevisions.get(line) ?? 0) + 1;
    lineRevisions.set(line, revision);
    // Retain old tokens/glosses until both parts of the replacement have completed. Preserve the
    // prototype for Line's tokenizer method (and structural test doubles), never mutate the source.
    const draft: Line = Object.assign(Object.create(Object.getPrototypeOf(line)), line);
    draft.content = typeof line.text === "string" ? line.text : line.content;
    return {line, draft, revision, ai: aiLineAnalysis.get(line)};
  });
  const tokenized = await Promise.allSettled(work.map(async ({draft, ai}) => {
    await draft.fillContentSeparations(tokenizeMiteiru);
    if (ai && Array.isArray(draft.content)) draft.content = withCurrentDictionary(ai.tokens, draft.content, true);
  }));
  if (!shouldContinue()) return false;
  const ready = work.filter(({line, draft, revision}, index) => {
    const result = tokenized[index];
    if (result.status === "rejected") console.error("[learning] could not tokenize:", line.text ?? line.content, result.reason);
    return result.status === "fulfilled" && Array.isArray(draft.content) && shouldIncludeLine(line) && lineRevisions.get(line) === revision;
  });
  if (!ready.length) return false;
  await fillLearningContent(ready.map(({draft}) => draft), support, cache);
  if (!shouldContinue()) return false;
  let changed = false;
  for (const {line, draft, revision} of ready) {
    if (lineRevisions.get(line) !== revision || !shouldIncludeLine(line)) continue;
    commitLineFrequency(line, draft.content as any[], support, frequency);
    line.content = draft.content;
    line.meaning = draft.meaning;
    changed = true;
  }
  return changed;
};

export const fillLineWithLearningContent = async (
  line: Line,
  language: string,
  tokenizeMiteiru: TokenizeMiteiru,
  frequency: Map<string, number>,
  shouldContinue: () => boolean = () => true
) => {
  const support = getSubtitleLanguageSupport(language);
  if (!support) return false;

  return fillLearningLines([line], support, tokenizeMiteiru, frequency, new Map(), shouldContinue, true);
};

// Lines tokenized together and glossed with one IPC call.
const LEARNING_CHUNK_LINES = 32;

export const fillSubtitleWithLearningContent = async (
  subtitle: SubtitleContainer,
  tokenizeMiteiru: TokenizeMiteiru,
  shouldContinue: () => boolean = () => true,
  getPriorityLineIndex: () => number = () => 0,
  shouldIncludeLine: (line: Line) => boolean = () => true
) => {
  const support = getSubtitleLanguageSupport(subtitle.language);
  if (!support) {
    subtitle.progress = "done";
    return false;
  }

  const cache: GlossCache = new Map();
  const pending = new Set(Array.from({length: Math.ceil(subtitle.lines.length / LEARNING_CHUNK_LINES)}, (_, index) => index));
  while (pending.size > 0 && shouldContinue()) {
    // Resolved tokenizer/cache promises can otherwise chain thousands of microtasks without giving
    // playback, painting or input a turn. Also lets a seek change which chunk is needed next.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (!shouldContinue()) break;
    const priorityLine = getPriorityLineIndex();
    const priorityChunk = Number.isFinite(priorityLine)
      ? Math.floor(Math.max(0, Math.min(priorityLine, subtitle.lines.length - 1)) / LEARNING_CHUNK_LINES)
      : -1;
    const chunkIndex = pending.has(priorityChunk) ? priorityChunk : pending.values().next().value!;
    pending.delete(chunkIndex);
    const start = chunkIndex * LEARNING_CHUNK_LINES;
    const chunk = subtitle.lines.slice(start, start + LEARNING_CHUNK_LINES);
    if (await fillLearningLines(chunk, support, tokenizeMiteiru, subtitle.frequency, cache, shouldContinue, false, shouldIncludeLine)) {
      // Lets a shown line pick up its tokens now, even while the video is paused.
      subtitle.notifyChanged?.();
    }
  }
  subtitle.progress = "done";
  return true;
};

/** A surface-scoped refresh queue. Constructing it does no work; ordinary loading owns initial analysis. */
export class SubtitleRetokenizer {
  private readonly pending = new Set<Line>();
  private queue: Line[] = [];
  private active: Line[] = [];
  private work: Promise<void> | null = null;
  private disposed = false;
  private readonly cache: GlossCache = new Map();
  private knownLines: Line[] | null = null;
  private knownLineCount = 0;
  private presentLines = new Set<Line>();

  constructor(private readonly options: {
    subtitle: SubtitleContainer;
    tokenizeMiteiru: TokenizeMiteiru;
    getPlaybackTimeMs: () => number;
    onChanged?: () => void;
  }) {}

  refresh(surfaces: readonly string[]) {
    if (this.disposed) return;
    const words = [...new Set(surfaces.filter((surface) => typeof surface === "string" && surface.length > 0))];
    if (!words.length) return;
    this.refreshLines(this.options.subtitle.lines.filter((line) => words.some((surface) => line.text.includes(surface))));
  }

  refreshLines(lines: readonly Line[]) {
    if (this.disposed) return;
    const affected = lines.filter((line) => this.includesLine(line));
    if (!affected.length) return;
    invalidateLearningLines(affected);
    for (const line of affected) this.pending.add(line);
    const now = this.options.getPlaybackTimeMs();
    this.queue = [...this.pending].sort((left, right) => {
      const leftPast = left.timeEnd < now;
      const rightPast = right.timeEnd < now;
      return Number(leftPast) - Number(rightPast)
        || (leftPast ? right.timeEnd - left.timeEnd : left.timeStart - right.timeStart);
    }).reverse();
    this.start();
  }

  dispose() {
    this.disposed = true;
    invalidateLearningLines([...this.pending, ...this.active]);
    this.pending.clear();
    this.queue = [];
  }

  async whenIdle() {
    while (this.work) await this.work;
  }

  private includesLine(line: Line) {
    const lines = this.options.subtitle.lines;
    if (this.knownLines !== lines || this.knownLineCount !== lines.length) {
      this.knownLines = lines;
      this.knownLineCount = lines.length;
      this.presentLines = new Set(lines);
    }
    return this.presentLines.has(line);
  }

  private start() {
    if (this.work || this.disposed || !this.pending.size) return;
    this.work = Promise.resolve().then(() => this.drain()).finally(() => {
      this.work = null;
      this.start();
    });
  }

  private async drain() {
    const {subtitle} = this.options;
    const support = getSubtitleLanguageSupport(subtitle.language);
    if (!support) {
      this.pending.clear();
      return;
    }
    while (!this.disposed && this.pending.size) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (this.disposed) return;
      const chunk: Line[] = [];
      while (chunk.length < 8 && this.queue.length) {
        const line = this.queue.pop()!;
        if (this.pending.delete(line) && this.includesLine(line)) chunk.push(line);
      }
      if (!chunk.length) return;
      this.active = chunk;
      const analyses = new Map(chunk.map((line) => [line, aiLineAnalysis.get(line)]));
      try {
        if (await fillLearningLines(chunk, support, this.options.tokenizeMiteiru, subtitle.frequency, this.cache, () => !this.disposed, true, (line) => this.includesLine(line))) {
          subtitle.notifyChanged();
          this.options.onChanged?.();
        }
      } catch (error) {
        console.error("[user dictionary] could not refresh subtitle words", error);
      } finally {
        this.active = [];
        // An AI result arriving during a dictionary refresh invalidates its old draft. Retry
        // that local overlay refresh once against the new boundaries and current dictionary.
        const changedAnalyses = chunk.filter((line) => this.includesLine(line) && analyses.get(line) !== aiLineAnalysis.get(line));
        if (changedAnalyses.length) this.refreshLines(changedAnalyses);
      }
    }
  }
}

type SubtitleSentenceKind = "japanese" | "chinese";

interface SubtitleTokenPresentation {
  sentenceKind: SubtitleSentenceKind;
  // Written with spaces between words (Vietnamese): words keep a full space whatever the setting.
  spacedWords?: boolean;
  getRubyReading: (part: any) => string;
}

const subtitleTokenPresentations: Array<{
  matches: (token: any) => boolean;
  presentation: SubtitleTokenPresentation;
}> = [
  {
    matches: (token) => Boolean(token?.jyutping || token?.pinyin),
    presentation: {
      sentenceKind: "chinese",
      getRubyReading: (part) => part?.jyutping || part?.pinyin || ""
    }
  },
  {
    matches: (token) => token?.hiragana !== undefined,
    presentation: {
      sentenceKind: "japanese",
      getRubyReading: (part) => part?.hiragana || part?.romaji || ""
    }
  },
  {
    matches: (token) => Array.isArray(token?.separation),
    presentation: {
      sentenceKind: "chinese",
      spacedWords: true,
      getRubyReading: (part) => part?.meaning || ""
    }
  }
];

const defaultTokenPresentation: SubtitleTokenPresentation = {
  sentenceKind: "japanese",
  getRubyReading: () => ""
};

export const getSubtitleTokenPresentation = (token: any) => (
  subtitleTokenPresentations.find(({matches}) => matches(token))?.presentation ?? defaultTokenPresentation
);

/**
 * What goes between two words on screen: a full space in languages written with spaces, otherwise a
 * thin space ("Space between words" on) or a hair space (off), which only keeps rubies apart.
 */
export const wordSeparator = (token: any, showSpace: boolean) => (
  getSubtitleTokenPresentation(token).spacedWords ? " " : showSpace ? "\u2009" : "\u200a"
);

/** What goes between two words in copied or plain text: a space where the language or the setting wants one. */
export const textWordSeparator = (token: any, showSpace: boolean) => (
  getSubtitleTokenPresentation(token).spacedWords || showSpace ? " " : ""
);

/**
 * Ruby HTML of a tokenized line, as copied for Anki. Text and readings are escaped, and each token
 * gets the reading its language uses (furigana, pinyin, jyutping or a Vietnamese gloss).
 */
export const buildRubyCopyHtml = (tokens: any[], showSpace: boolean): string => tokens
  .map((token) => {
    const presentation = getSubtitleTokenPresentation(token);
    const ruby = (token?.separation ?? [])
      .map((part) => `<ruby>${escapeHtml(part.main)}<rt>${escapeHtml(presentation.getRubyReading(part))}</rt></ruby>`)
      .join('');
    return ruby || escapeHtml(token?.origin ?? '');
  })
  .map((html, index) => (index > 0 ? textWordSeparator(tokens[index - 1], showSpace) : '') + html)
  .join('');
