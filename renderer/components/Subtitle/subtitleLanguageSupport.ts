import {videoConstants} from "../../utils/constants";
import type {Line, SubtitleContainer} from "./DataStructures";

export type TokenizeMiteiru = (text: string) => Promise<any[]>;

type LearningContentFiller = (line: Line, frequency: Map<string, number>) => Promise<void>;

interface SubtitleLanguageSupport {
  fillLearningContent: LearningContentFiller;
}

const subtitleLanguageSupportByLang: Record<string, SubtitleLanguageSupport> = {
  [videoConstants.japaneseLang]: {
    fillLearningContent: (line, frequency) => line.fillContentWithLearningKotoba(frequency)
  },
  [videoConstants.chineseLang]: {
    fillLearningContent: (line, frequency) => line.fillContentWithLearningChinese(frequency)
  },
  [videoConstants.cantoneseLang]: {
    fillLearningContent: (line, frequency) => line.fillContentWithLearningChinese(frequency)
  },
  [videoConstants.vietnameseLang]: {
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

export const fillSubtitleWithLearningContent = async (
  subtitle: SubtitleContainer,
  tokenizeMiteiru: TokenizeMiteiru,
  shouldContinue: () => boolean = () => true
) => {
  if (!isLearningSubtitleLanguage(subtitle.language)) {
    subtitle.progress = "done";
    return false;
  }

  const promises = subtitle.lines.map(async (line) => {
    if (!shouldContinue()) return;
    await fillLineWithLearningContent(line, subtitle.language, tokenizeMiteiru, subtitle.frequency);
  });

  await Promise.all(promises);
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
