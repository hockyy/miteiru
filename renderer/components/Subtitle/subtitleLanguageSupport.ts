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

const chineseSupport = (glossChannel: string): SubtitleLanguageSupport => ({
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
  [languageCodes.mandarin]: chineseSupport("learningGlossesChinese"),
  [languageCodes.cantonese]: chineseSupport("learningGlossesChinese"),
  [languageCodes.vietnamese]: chineseSupport("learningGlossesVietnamese")
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
  const slots: { line: Line; index: number; key: string }[] = [];

  for (const line of lines) {
    if (!Array.isArray(line.content)) continue;
    line.meaning = Array(line.content.length).fill("");
    line.content.forEach((token, index) => {
      const word = support.frequencyKey(token);
      frequency.set(word, (frequency.get(word) ?? 0) + 1);
      const lookup = support.lookup(token);
      if (!lookup) return;
      const key = glossKey(lookup);
      slots.push({line, index, key});
      if (cache.has(key) || requested.has(key)) return;
      requested.add(key);
      requests.push(lookup);
    });
  }

  if (requests.length > 0) {
    const glosses: string[] = await window.ipc.invoke(support.glossChannel, requests);
    requests.forEach((lookup, index) => cache.set(glossKey(lookup), glosses?.[index] ?? ""));
  }
  for (const {line, index, key} of slots) line.meaning[index] = cache.get(key) ?? "";
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
    await Promise.all(chunk.map((line) => line.fillContentSeparations(tokenizeMiteiru)));
    await fillLearningContent(chunk, support, subtitle.frequency, cache);
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
