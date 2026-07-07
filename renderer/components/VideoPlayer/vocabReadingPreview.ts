import { videoConstants } from '../../utils/constants';

type TokenPart = {
  hiragana?: string;
  romaji?: string;
  pinyin?: string;
  jyutping?: string;
};

type AnalyzedToken = {
  origin?: string;
  hiragana?: string;
  romaji?: string;
  pinyin?: string;
  jyutping?: string;
  separation?: TokenPart[];
};

/** Reading text shown on vocab row hover (hiragana / pinyin / jyutping — not surface form). */
export const getVocabReadingPreview = (
  tokens: AnalyzedToken[],
  lang: string,
): string | null => {
  if (!tokens?.length) {
    return null;
  }

  if (lang === videoConstants.japaneseLang) {
    const reading = tokens
      .map((token) => {
        if (Array.isArray(token.separation) && token.separation.length > 0) {
          return token.separation.map((part) => part.hiragana || '').join('');
        }
        return token.hiragana || token.romaji || '';
      })
      .join('');
    return reading.trim() || null;
  }

  if (lang === videoConstants.chineseLang || lang === videoConstants.cantoneseLang) {
    const reading = tokens
      .flatMap((token) => {
        if (Array.isArray(token.separation) && token.separation.length > 0) {
          return token.separation.map((part) => part.pinyin || part.jyutping || '');
        }
        return [token.pinyin || token.jyutping || ''];
      })
      .filter(Boolean)
      .join(' ');
    return reading.trim() || null;
  }

  return null;
};
