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

/**
 * Counts the words of tokenized lines and fills their glosses with one IPC call for all words not
 * yet in `cache`. Subtitles repeat words constantly, so most chunks need few or no lookups.
 */
const fillLearningContent = async (
  lines: Line[],
  support: SubtitleLanguageSupport,
  frequency: Map<string, number>,
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
      const word = support.frequencyKey(token);
      frequency.set(word, (frequency.get(word) ?? 0) + 1);
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
      glosses = await window.ipc.invoke(support.glossChannel, requests);
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

export const fillLineWithLearningContent = async (
  line: Line,
  language: string,
  tokenizeMiteiru: TokenizeMiteiru,
  frequency: Map<string, number>
) => {
  const support = getSubtitleLanguageSupport(language);
  if (!support) return false;

  await line.fillContentSeparations(tokenizeMiteiru);
  await fillLearningContent([line], support, frequency, new Map());
  return true;
};

// Lines tokenized together and glossed with one IPC call; the subtitle fills in from the start.
const LEARNING_CHUNK_LINES = 32;

export const fillSubtitleWithLearningContent = async (
  subtitle: SubtitleContainer,
  tokenizeMiteiru: TokenizeMiteiru,
  shouldContinue: () => boolean = () => true
) => {
  const support = getSubtitleLanguageSupport(subtitle.language);
  if (!support) {
    subtitle.progress = "done";
    return false;
  }

  // Checked before every chunk, so loading another subtitle stops this one within a chunk.
  const cache: GlossCache = new Map();
  for (let start = 0; start < subtitle.lines.length && shouldContinue(); start += LEARNING_CHUNK_LINES) {
    const chunk = subtitle.lines.slice(start, start + LEARNING_CHUNK_LINES);
    // A line that fails to tokenize stays plain text; the rest of the subtitle carries on.
    const tokenized = await Promise.allSettled(chunk.map((line) => line.fillContentSeparations(tokenizeMiteiru)));
    tokenized.forEach((result, index) => {
      if (result.status === "rejected") console.error("[learning] could not tokenize:", chunk[index].content, result.reason);
    });
    await fillLearningContent(chunk, support, subtitle.frequency, cache);
    // Lets a shown line pick up its tokens now, even while the video is paused.
    subtitle.notifyChanged?.();
  }
  subtitle.progress = "done";
  return true;
};

type SubtitleSentenceKind = "japanese" | "chinese";

interface SubtitleTokenPresentation {
  sentenceKind: SubtitleSentenceKind;
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
  .join(showSpace ? ' ' : '');
