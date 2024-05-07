export const videoConstants = {
  supportedVideoFormats: [
    'mkv', 'mp4', 'webm', 'ogg', 'mov', 'avi', 'flv', '3gp', 'wmv', 'wav', 'hls', 'mp3', 'mp2t'
  ],
  supportedSubtitleFormats: [
    'ass', 'srt', 'vrt'
  ],
  shiftAmount: 100,
  subtitleFramerate: 30,
  playingClass: ["", "playing"],
  cjkRegex: /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/gu,
  cantoneseLang: 'yue',
  cantoneseLang2: 'zh-HK',
  englishLang: 'en',
  japaneseLang: 'ja',
  chineseLang: 'zh-CN',
  learningStateLength: 3
}