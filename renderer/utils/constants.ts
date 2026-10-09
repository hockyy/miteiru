import {
  cantoneseToneMap,
  hanCharacterRegex,
  languageCodes,
  ocrLanguageCodes,
  speechLanguageCodes
} from "../languages/manifest";

// A subtitle loaded with the all-caps fix is read from a sentence-case copy in the temp folder whose
// name starts with this (main/helpers/subtitleCaches.ts).
export const NORMALIZED_SUBTITLE_PREFIX = "miteiru_normalized_";

export const videoConstants = {
  supportedVideoFormats: [
    'mkv', 'mp4', 'webm', 'ogg', 'mov', 'avi', 'flv', '3gp', 'wmv', 'wav', 'hls', 'mp3', 'mp2t', 'ts'
  ],
  supportedSubtitleFormats: [
    'ass', 'srt', 'vrt', 'vtt', 'txt', 'lrc', 'huf'
  ],
  shiftAmount: 100,
  subtitleFramerate: 30,
  subtitleStartPlusMultiplier: 3,
  subtitleEndPlusMultiplier: 8,
  autoPauseMultiplier: 1.02,
  playingClass: ["", "playing"],
  cjkRegex: hanCharacterRegex,
  cantoneseLang: languageCodes.cantonese,
  englishLang: languageCodes.english,
  japaneseLang: languageCodes.japanese,
  chineseLang: languageCodes.mandarin,
  vietnameseLang: languageCodes.vietnamese,
  varLang: speechLanguageCodes,
  ocrLang: ocrLanguageCodes,
  cantoneseToneMap,
  learningStateLength: 3
}

export const learningConstants = {
  scoreCorrect: 5,
  scoreWrong: 2
}