export const languageCodes = {
  cantonese: "yue",
  english: "en",
  japanese: "ja",
  mandarin: "zh-CN",
  vietnamese: "vi"
};

export const languageModes = [
  {
    id: 0,
    pluginId: "japanese-kuromoji",
    name: "Kuromoji - Japanese",
    channel: "loadKuromoji",
    emoji: "🐣",
    description: "うん、ちょっと見てるだけ 😏",
    tokenizerMode: "kuromoji",
    languageCode: languageCodes.japanese,
    dependencies: ["han-character-core"]
  },
  {
    id: 1,
    pluginId: "japanese-mecab",
    name: "Mecab - Japanese",
    channel: "loadMecab",
    emoji: "👹",
    description: "準備OK、船長！🫡",
    tokenizerMode: "mecab",
    languageCode: languageCodes.japanese,
    dependencies: ["han-character-core"]
  },
  {
    id: 2,
    pluginId: "cantonese-jieba",
    name: "Jieba - Cantonese",
    channel: "loadCantonese",
    emoji: "🥘",
    description: "準備好啦，行啊",
    tokenizerMode: "cantonese",
    languageCode: languageCodes.cantonese,
    dependencies: ["han-character-core"]
  },
  {
    id: 3,
    pluginId: "mandarin-jieba",
    name: "Jieba - Chinese",
    channel: "loadChinese",
    emoji: "🐉",
    description: "加油! 💥",
    tokenizerMode: "jieba",
    languageCode: languageCodes.mandarin,
    dependencies: ["han-character-core"]
  },
  {
    id: 4,
    pluginId: "vietnamese",
    name: "Vietnamese",
    channel: "loadVietnamese",
    emoji: "🏯",
    description: "Chúc may mắn! 🌟",
    tokenizerMode: "vietnamese",
    languageCode: languageCodes.vietnamese
  }
];

export const speechLanguageCodes = {
  [languageCodes.cantonese]: ["zh-HK", "yue"],
  [languageCodes.japanese]: ["ja"],
  [languageCodes.mandarin]: ["zh-TW", "zh-CN"],
  [languageCodes.vietnamese]: ["vi"]
};

export const ocrLanguageCodes = {
  [languageCodes.cantonese]: "chi_tra",
  [languageCodes.japanese]: "jpn",
  [languageCodes.mandarin]: "chi_tra",
  [languageCodes.vietnamese]: "vie"
};

export const hanCharacterRegex = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\u3000-\u303f]/g;

export const cantoneseToneMap = {
  1: "‾",
  2: "/",
  3: "–",
  4: "⦦",
  5: "⦧",
  6: "_"
};

export const getLanguageModeByTokenizerMode = (tokenizerMode) => (
  languageModes.find((mode) => mode.tokenizerMode === tokenizerMode)
);

export const getLanguageDisplayName = (languageCode) => {
  switch (languageCode) {
    case languageCodes.japanese: return "Japanese";
    case languageCodes.mandarin: return "Chinese";
    case languageCodes.cantonese: return "Cantonese";
    case languageCodes.vietnamese: return "Vietnamese";
    case languageCodes.english: return "English";
    default: return languageCode;
  }
};

export const isHanLanguage = (languageCode) => (
  languageCode === languageCodes.japanese ||
  languageCode === languageCodes.mandarin ||
  languageCode === languageCodes.cantonese
);
