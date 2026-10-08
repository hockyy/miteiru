import {languageCodes} from "../../languages/manifest";
import {escapeHtml} from "../../utils/html";
import type {Line, SubtitleContainer} from "./DataStructures";

export type TokenizeMiteiru = (text: string) => Promise<any[]>;

type LearningContentFiller = (line: Line, frequency: Map<string, number>) => Promise<void>;

interface SubtitleLanguageSupport {
  fillLearningContent: LearningContentFiller;
}

const subtitleLanguageSupportByLang: Record<string, SubtitleLanguageSupport> = {
  [languageCodes.japanese]: {
    fillLearningContent: (line, frequency) => line.fillContentWithLearningKotoba(frequency)
  },
  [languageCodes.mandarin]: {
    fillLearningContent: (line, frequency) => line.fillContentWithLearningChinese(frequency)
  },
  [languageCodes.cantonese]: {
    fillLearningContent: (line, frequency) => line.fillContentWithLearningChinese(frequency)
  },
  [languageCodes.vietnamese]: {
    fillLearningContent: (line, frequency) => line.fillContentWithLearningVietnamese(frequency)
  }
};

export const getSubtitleLanguageSupport = (language: string) => subtitleLanguageSupportByLang[language];

export const isLearningSubtitleLanguage = (language: string) => Boolean(getSubtitleLanguageSupport(language));

export const fillLineWithLearningContent = async (
  line: Line,
  language: string,
  tokenizeMiteiru: TokenizeMiteiru,
  frequency: Map<string, number>
) => {
  const support = getSubtitleLanguageSupport(language);
  if (!support) return false;

  await line.fillContentSeparations(tokenizeMiteiru);
  await support.fillLearningContent(line, frequency);
  return true;
};

const LEARNING_CONCURRENCY = 8;

export const fillSubtitleWithLearningContent = async (
  subtitle: SubtitleContainer,
  tokenizeMiteiru: TokenizeMiteiru,
  shouldContinue: () => boolean = () => true
) => {
  if (!isLearningSubtitleLanguage(subtitle.language)) {
    subtitle.progress = "done";
    return false;
  }

  // A few lines at a time, checking before each one: starting every line at once fired thousands of
  // lookups up front, so loading another subtitle could not stop the old one.
  let nextLine = 0;
  const worker = async () => {
    while (nextLine < subtitle.lines.length && shouldContinue()) {
      const line = subtitle.lines[nextLine++];
      await fillLineWithLearningContent(line, subtitle.language, tokenizeMiteiru, subtitle.frequency);
    }
  };
  await Promise.all(Array.from({length: LEARNING_CONCURRENCY}, worker));
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
