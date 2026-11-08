import {videoConstants} from "../../utils/constants";
import {escapeHtml} from "../../utils/html";
import {isKana, toHiragana} from "wanakana";
import {splitOkuriganaCompact} from "../../utils/japaneseOkurigana";

const normalizeStringArray = (value) => {
  if (Array.isArray(value)) return value.flatMap(normalizeStringArray);
  if (typeof value === 'string') return [value];
  return [];
};

const uniqueNonEmpty = (values) => Array.from(new Set(
  values
    .map((value) => typeof value === 'string' ? value.trim() : '')
    .filter(Boolean)
));

/** The first kana reading of a JMdict entry that applies to this kanji spelling. */
export const pickJapaneseReading = (entry, spelling) => {
  const kana = Array.isArray(entry?.kana) ? entry.kana : [];
  return kana.find((item) => {
    const applies = item?.appliesToKanji;
    return !applies?.length || applies.includes('*') || applies.includes(spelling);
  })?.text;
};

/**
 * What the header shows as the word. Words usually written in kana (JMdict `uk`), or with no
 * kanji at all, show the kana form the learner clicked; others show each kanji spelling with
 * the kana JMdict pairs with it. `reading` is left out when the entry has none to offer.
 */
export const getJapaneseHeadwords = (entry, term) => {
  const kana = Array.isArray(entry?.kana) ? entry.kana : [];
  const kanji = Array.isArray(entry?.kanji) ? entry.kanji : [];
  const usuallyKana = (entry?.sense || []).some((sense) => sense?.misc?.includes('uk'));
  if (kana.length && isKana(term) && (kanji.length === 0 || usuallyKana)) {
    const form = kana.find((item) => item.text === term) ?? kana[0];
    return [{...form, key: 0, reading: form.text}];
  }
  if (kanji.length) {
    return kanji.map((item, index) => ({...item, key: item.key ?? index, reading: pickJapaneseReading(entry, item.text)}));
  }
  return [{text: term, key: 0}];
};

/** A header token built from a dictionary spelling and its kana, in the shape Kuromoji tokens have. */
export const buildJapaneseHeadwordToken = (text, reading) => {
  const hiragana = toHiragana(reading, {convertLongVowelMark: false});
  return {origin: text, hiragana, basicForm: text, pos: '', separation: splitOkuriganaCompact(text, hiragana)};
};

/** Ruby tokens for one headword: from its dictionary kana when it has one, else read by Kuromoji. */
export const getJapaneseHeadwordTokens = async (item, tokenizeMiteiru) => (
  item.reading ? [buildJapaneseHeadwordToken(item.text, item.reading)] : tokenizeMiteiru(item.text)
);

export const getMeaningEntries = async (term, lang) => {
  let entries = [];
  if (lang === videoConstants.japaneseLang) {
    entries = await window.backend.invoke('queryJapanese', term, 5);
    entries.forEach(entry => {
      entry.single = getJapaneseHeadwords(entry, term);
    });
  } else if (lang === videoConstants.cantoneseLang || lang === videoConstants.chineseLang) {
    entries = await window.backend.invoke('queryChinese', term, 5);
    entries.forEach(entry => {
      entry.single = entry.content.split('，').map((text, index) => ({key: index, text}));
    });
  } else if (lang === videoConstants.vietnameseLang) {
    entries = await window.backend.invoke('queryVietnamese', term, 5);
    entries.forEach(entry => {
      entry.single = entry.content.split(' ').map((text, index) => ({key: index, text}));
    });
  }

  // Placeholder so the header can still tokenize the term; `notFound` tells the panel to say so.
  if (entries.length === 0) {
    if (lang === videoConstants.japaneseLang) {
      entries.push({
        id: "0",
        notFound: true,
        single: [{key: 0, text: term}],
        sense: []
      });
    } else {
      entries.push({
        id: "0",
        notFound: true,
        content: term,
        simplified: term,
        pinyin: [],
        jyutping: [],
        meaning: [],
        single: [{key: 0, text: term}]
      });
    }
  }

  return entries;
};

export const getDictionaryDefinitions = (meaningContent, lang) => {
  if (lang === videoConstants.cantoneseLang || lang === videoConstants.chineseLang || lang === videoConstants.vietnameseLang) {
    return normalizeStringArray(meaningContent?.meaning);
  }

  if (meaningContent?.sense?.length) {
    return meaningContent.sense.flatMap((sense) => (
      sense?.gloss || []
    ).map((gloss) => gloss?.text).filter((text) => typeof text === 'string' && text.length > 0));
  }

  return [];
};

export const getReadingsFromRomajiedData = (romajiedData) => {
  return uniqueNonEmpty(romajiedData.flatMap(({romajied}) => {
    if (!Array.isArray(romajied)) return [];

    return romajied.flatMap((token) => {
      if (Array.isArray(token?.separation)) {
        return token.separation.map((part) => (
          part?.hiragana || part?.romaji || part?.pinyin || part?.jyutping || part?.meaning || ''
        ));
      }
      return [token?.hiragana || token?.romaji || token?.pinyin || token?.jyutping || ''];
    });
  }));
};

/** When MeaningBox shows multiple headword variants, Anki export uses the first only. */
export const getPrimaryRomajiedVariant = (romajiedData) => {
  if (!Array.isArray(romajiedData) || romajiedData.length === 0) {
    return [];
  }
  return [romajiedData[0]];
};

export const buildRubyHtmlFromRomajiedData = (romajiedData) => {
  let rubyHtml = '';
  romajiedData.forEach(({ romajied }) => {
    if (Array.isArray(romajied)) {
      romajied.forEach((token) => {
        const isChineseSentence = token.jyutping || token.pinyin;
        const isJapaneseSentence = token.hiragana !== undefined;
        const isVietnameseSentence = token.separation && !token.jyutping && !token.pinyin && !token.hiragana;

        if (token.separation) {
          token.separation.forEach((part) => {
            let reading = '';
            if (isChineseSentence) {
              reading = part.jyutping || part.pinyin || '';
            } else if (isJapaneseSentence) {
              reading = part.hiragana || part.romaji || '';
            } else if (isVietnameseSentence) {
              reading = part.meaning || '';
            }
            rubyHtml += `<ruby>${escapeHtml(part.main)}<rt>${escapeHtml(reading)}</rt></ruby>`;
          });
        } else {
          rubyHtml += escapeHtml(typeof token === 'string' ? token : (token.origin ?? ''));
        }
      });
    }
  });
  return rubyHtml;
};

export const getRomajiedDataForMeaningContent = async (term, meaningContent, lang, tokenizeMiteiru) => {
  if (lang === videoConstants.japaneseLang) {
    const first = meaningContent.single?.[0];
    if (!first?.text) {
      return [];
    }
    return [{
      key: first.key ?? 0,
      romajied: await getJapaneseHeadwordTokens(first, tokenizeMiteiru),
    }];
  }

  if (lang === videoConstants.cantoneseLang || lang === videoConstants.chineseLang || lang === videoConstants.vietnameseLang) {
    const usedData = (meaningContent && meaningContent.simplified && meaningContent.simplified.includes(term)) ? meaningContent.simplified : meaningContent.content;
    return [{
      key: 0,
      romajied: (await tokenizeMiteiru(usedData || term))
    }];
  }

  return [{
    key: 0,
    romajied: (await tokenizeMiteiru(term))
  }];
};
