export const videoConstants = {
  supportedVideoFormats: [
    'mkv', 'mp4', 'webm', 'ogg', 'mov', 'avi', 'flv', '3gp', 'wmv', 'wav', 'hls', 'mp3', 'mp2t'
  ],
  supportedSubtitleFormats: [
    'ass', 'srt', 'vrt'
  ],
  shiftAmount: 100,
  playingClass: ["", "playing"],
}

export const japaneseConstants = {
  meaningLengthLimit: 15,
  mecabDefaultDirectory: {
    'darwin': '/opt/homebrew/bin/mecab',
    'linux': '/usr/bin/mecab',
    'win32': 'C:\\Program Files (x86)\\MeCab\\bin\\mecab.exe'
  }
}

export const appConstants = {
  checkSymbol: ['❌', '✅', '🙃'],
  initialCheck: {ok: 0, message: 'Check is not run yet'}
}