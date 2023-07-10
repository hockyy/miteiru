export const videoConstants = {
  supportedVideoFormats: [
    'mkv', 'mp4', 'webm', 'ogg', 'mov', 'avi', 'flv', '3gp', 'wmv', 'wav', 'hls', 'mp3', 'mp2t'
  ],
  supportedSubtitleFormats: [
    'ass', 'srt', 'vrt'
  ],
  shiftAmount: 100,
  playingClass: ["", "playing"],
  cjkRegex: /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/gu
}

export const japaneseConstants = {
  meaningLengthLimit: 15
}
