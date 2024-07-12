export const videoConstants = {
  supportedVideoFormats: [
    'mkv', 'mp4', 'webm', 'ogg', 'mov', 'avi', 'flv', '3gp', 'wmv', 'wav', 'hls', 'mp3', 'mp2t', 'ts'
  ],
  supportedSubtitleFormats: [
    'ass', 'srt', 'vrt'
  ],
  shiftAmount: 100,
  subtitleFramerate: 30,
  subtitleStartPlusMultiplier: 3,
  subtitleEndPlusMultiplier: 8,
  autoPauseMultiplier: 1.02,
  playingClass: ["", "playing"],
  cjkRegex: /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/gu,
  cantoneseLang: 'yue',
  englishLang: 'en',
  japaneseLang: 'ja',
  chineseLang: 'zh-CN',
  varLang: {
    "yue": ["zh-HK", "yue"],
    "ja": ["ja"],
    "zh-CN": ['zh-TW', 'zh-CN']
  },
  learningStateLength: 3
}

export const learningConstants = {
  scoreCorrect: 5,
  scoreWrong: 2
}