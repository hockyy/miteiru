export const videoConstants = {
  supportedVideoFormats: [
    'mkv', 'mp4', 'webm', 'ogg', 'mov', 'avi', 'flv', '3gp', 'wmv', 'wav', 'hls', 'mp3', 'mp2t', 'ts'
  ],
  supportedSubtitleFormats: [
    'ass', 'srt', 'vrt', 'vtt', 'txt', 'lrc'
  ],
  shiftAmount: 100,
  subtitleFramerate: 30,
  subtitleStartPlusMultiplier: 3,
  subtitleEndPlusMultiplier: 8,
  autoPauseMultiplier: 1.02,
  playingClass: ["", "playing"],
  cjkRegex: /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af\u3000-\u303f]/g,
  cantoneseLang: 'yue',
  englishLang: 'en',
  japaneseLang: 'ja',
  chineseLang: 'zh-CN',
  varLang: {
    "yue": ["zh-HK", "yue"],
    "ja": ["ja"],
    "zh-CN": ['zh-TW', 'zh-CN']
  },
  ocrLang: {
    "yue": "chi_tra",
    "ja": "jpn",
    "zh-CN": "chi_tra",
  },
  cantoneseToneMap: {
    1: '‾',
    2: '/',
    3: '–',
    4: '⦦',
    5: '⦧',
    6: '_'
  },
  learningStateLength: 3
}

export const learningConstants = {
  scoreCorrect: 5,
  scoreWrong: 2
}