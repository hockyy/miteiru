import {videoConstants} from "../../utils/constants";

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

export const getMeaningEntries = async (term, lang) => {
  let entries = [];
  if (lang === videoConstants.japaneseLang) {
    entries = await window.ipc.invoke('queryJapanese', term, 5);
    entries.forEach(entry => {
      entry.single = entry.kanji.length ? entry.kanji : [{text: term}];
    });
  } else if (lang === videoConstants.cantoneseLang || lang === videoConstants.chineseLang) {
    entries = await window.ipc.invoke('queryChinese', term, 5);
    entries.forEach(entry => {
      entry.single = entry.content.split('，').map(text => ({text}));
    });
  } else if (lang === videoConstants.vietnameseLang) {
    entries = await window.ipc.invoke('queryVietnamese', term, 5);
    entries.forEach(entry => {
      entry.single = entry.content.split(' ').map(text => ({text}));
    });
  }

  if (entries.length === 0) {
    if (lang === videoConstants.japaneseLang) {
      entries.push({
        id: "0",
        single: [{text: term}],
        sense: []
      });
    } else {
      entries.push({
        id: "0",
        content: term,
        simplified: term,
        pinyin: [],
        jyutping: [],
        meaning: [],
        single: [{text: term}]
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
    ).map((gloss) => gloss?.text));
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
            rubyHtml += `<ruby>${part.main}<rt>${reading}</rt></ruby>`;
          });
        } else {
          rubyHtml += token.origin || token;
        }
      });
    }
  });
  return rubyHtml;
};

export const getRomajiedDataForMeaningContent = async (term, meaningContent, lang, tokenizeMiteiru) => {
  if (lang === videoConstants.japaneseLang) {
    return await Promise.all(
      meaningContent.single.map(async (val) => ({
        key: val.key || val.text,
        romajied: await tokenizeMiteiru(val.text)
      }))
    );
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
