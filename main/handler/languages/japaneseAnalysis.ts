import {spawnSync} from "child_process";
import {isKana, isKanji, isMixed, toHiragana, toRomaji} from "wanakana";

export interface MiteiruJapaneseWord {
  origin: string;
  hiragana: string;
  basicForm: string;
  pos: string;
}

export interface MiteiruJapaneseSeparation {
  main: string;
  hiragana: string;
  romaji: string;
  isKana: boolean;
  isKanji: boolean;
  isMixed: boolean;
}

export interface MiteiruJapaneseWordWithSeparations extends MiteiruJapaneseWord {
  separation: MiteiruJapaneseSeparation[];
}

export interface KuromojinWord {
  word_id: number;
  word_type: string;
  word_position: number;
  surface_form: string;
  pos: string;
  pos_detail_1: string;
  pos_detail_2: string;
  pos_detail_3: string;
  conjugated_type: string;
  conjugated_form: string;
  basic_form: string;
  reading: string;
  pronunciation: string;
}

type ParseResponse = {
  ok: boolean;
  pairs: MiteiruJapaneseWord[];
  launched?: boolean;
};

type RunResponse = {
  ok: boolean;
  splittedSentences: string[];
  /** False when MeCab could not be started or timed out, so other output formats won't help. */
  launched?: boolean;
};

const notOkRunAndSplitResponse: RunResponse = {ok: false, splittedSentences: []};
const notOkParseResponse: ParseResponse = {ok: false, pairs: []};

const anyOneTrue = (word: string, func: (value: string) => boolean) => {
  for (const ch of word) {
    if (func(ch)) return true;
  }
  return false;
};

const createStoredObject = (
  textMain: string,
  textHiragana: string,
  textSpoken: string = textHiragana
): MiteiruJapaneseSeparation => ({
  main: textMain,
  hiragana: textHiragana,
  romaji: toRomaji(textSpoken),
  isKana: anyOneTrue(textMain, isKana),
  isKanji: anyOneTrue(textMain, isKanji),
  isMixed: anyOneTrue(textMain, isMixed)
});

/**
 * @param spokenReading Optional kana aligned 1:1 with `reading`, used only for romaji.
 */
const splitOkuriganaCompact = (text: string, reading?: string, spokenReading?: string): MiteiruJapaneseSeparation[] => {
  let hiragana = reading;
  if (typeof hiragana === "undefined") {
    hiragana = text;
  } else if (hiragana === "*") {
    hiragana = toHiragana(text);
  }
  const spoken = spokenReading?.length === hiragana.length ? spokenReading : hiragana;

  const kanjiPointer = [text.length, -1];
  const stored: MiteiruJapaneseSeparation[] = [];

  for (let i = 0; i < text.length + 1; i++) {
    kanjiPointer[0] = i;
    if (i === text.length + 1 || isKanji(text[i])) break;
  }

  for (let i = text.length - 1; i >= 0; i--) {
    kanjiPointer[1] = i;
    if (i === -1 || isKanji(text[i])) break;
  }

  const pushPart = (main: string, start: number, end: number) => {
    stored.push(createStoredObject(main, hiragana.substring(start, end), spoken.substring(start, end)));
  };

  if (kanjiPointer[0] > 0) {
    pushPart(text.substring(0, kanjiPointer[0]), 0, kanjiPointer[0]);
  }

  if (kanjiPointer[0] <= kanjiPointer[1]) {
    const spentBack = text.length - kanjiPointer[1];
    pushPart(
      text.substring(kanjiPointer[0], kanjiPointer[1] + 1),
      kanjiPointer[0],
      hiragana.length - spentBack + 1
    );
  }

  if (kanjiPointer[0] <= kanjiPointer[1] && kanjiPointer[1] + 1 !== text.length) {
    const spentBack = text.length - kanjiPointer[1];
    pushPart(
      text.substring(kanjiPointer[1] + 1, text.length),
      hiragana.length - spentBack + 1,
      hiragana.length
    );
  }

  return stored;
};

const runAndSplit = (text: string, mecabCommand: string, outputFormat: string): RunResponse => {
  const normalizedText = text.replace(/[^\S\n]/g, " ").trim();
  // No shell: the command is a path, and quoting it into a shell line would let a crafted path
  // run other commands.
  const result = spawnSync(mecabCommand, outputFormat !== "" ? ["-O", outputFormat] : [], {
    input: normalizedText,
    timeout: 30000
  });
  if (result.error || !result.stdout) return {...notOkRunAndSplitResponse, launched: false};

  const sentences = result.stdout.toString();
  const splittedSentences = sentences.split("\n");
  if (splittedSentences.length === 0 || splittedSentences[0].includes(`unkown format type [${outputFormat}]`)) {
    return notOkRunAndSplitResponse;
  }

  while (splittedSentences.length > 0 && splittedSentences[splittedSentences.length - 1] === "") {
    splittedSentences.pop();
  }

  return {ok: true, splittedSentences};
};

const normalizeReading = (value: string) => isKana(value) ? toHiragana(value, {passRomaji: true}) : value;

const parseChamame = (text: string, mecabCommand: string): ParseResponse => {
  const {ok, splittedSentences, launched} = runAndSplit(text, mecabCommand, "chamame");
  if (launched === false) return {...notOkParseResponse, launched};
  if (splittedSentences.length === 0 || !ok) return notOkParseResponse;

  const pairs: MiteiruJapaneseWord[] = [];
  for (const tmpWord of splittedSentences) {
    let word = tmpWord;
    if (word[0] === "B") {
      word = word.substring(1);
      pairs.push({origin: "\n", hiragana: "\n", basicForm: "\n", pos: ""});
    }
    const splittedWord = word.trim().split("\t");
    pairs.push({
      origin: splittedWord[0],
      hiragana: normalizeReading(splittedWord[1]),
      basicForm: splittedWord[3],
      pos: splittedWord[4]
    });
  }
  return {ok: true, pairs};
};

const parseChasen = (text: string, mecabCommand: string): ParseResponse => {
  const {ok, splittedSentences} = runAndSplit(text, mecabCommand, "chasen");
  if (splittedSentences.length === 0 || !ok) return notOkParseResponse;

  const pairs: MiteiruJapaneseWord[] = [];
  for (const word of splittedSentences) {
    if (word === "EOS") continue;
    const splittedWord = word.trim().split("\t");
    pairs.push({
      origin: splittedWord[0],
      hiragana: normalizeReading(splittedWord[1]),
      basicForm: splittedWord[2],
      pos: splittedWord[3]
    });
  }
  return {ok: true, pairs};
};

const parseEmpty = (text: string, mecabCommand: string): ParseResponse => {
  const {ok, splittedSentences} = runAndSplit(text, mecabCommand, "");
  if (splittedSentences.length === 0 || !ok) return notOkParseResponse;

  const pairs: MiteiruJapaneseWord[] = [];
  for (const word of splittedSentences) {
    if (word === "EOS") continue;
    const splittedFeature = word.trim().split("\t");
    const origin = splittedFeature[0];
    const splittedWord = splittedFeature[1].split(",");
    pairs.push({
      origin,
      hiragana: normalizeReading(splittedWord[5]),
      basicForm: splittedWord[4],
      pos: splittedWord[0]
    });
  }
  return {ok: true, pairs};
};

export const separateJapaneseWords = (
  pairs: MiteiruJapaneseWord[]
): MiteiruJapaneseWordWithSeparations[] => pairs.map((wordPair) => ({
  ...wordPair,
  separation: splitOkuriganaCompact(wordPair.origin, wordPair.hiragana)
}));

export const getFurigana = (text: string, mecabCommand = "mecab"): MiteiruJapaneseWordWithSeparations[] => {
  let res = parseChamame(text, mecabCommand);
  if (res.launched === false) return [];
  if (!res.ok) {
    res = parseChasen(text, mecabCommand);
    if (!res.ok) {
      res = parseEmpty(text, mecabCommand);
    }
  }
  return separateJapaneseWords(res.pairs);
};

// Unknown words have no reading; keep the old empty-reading behavior for them.
const kuromojiReading = (item: KuromojinWord): string => item.reading ?? item.pronunciation ?? "";

/**
 * Kuromoji's `pronunciation` is the spoken form (ハ → ワ, オオキイ → オーキイ).
 * Romaji keeps its sound changes but not its long-vowel marks, which would
 * otherwise read 大きい as "oukii" and 先生 as "sensee".
 */
const spokenKana = (reading: string, pronunciation?: string): string => {
  const written = Array.from(reading);
  const spoken = Array.from(pronunciation ?? "");
  if (spoken.length !== written.length) return reading;
  return written.map((char, index) => (spoken[index] === "ー" ? char : spoken[index])).join("");
};

// Furigana follows the dictionary reading; ー stays as written (ホーム → ほーむ, not ほうむ).
const toFuriganaHiragana = (kana: string): string => toHiragana(kana, {convertLongVowelMark: false});

export const kuromojinToJapaneseWords = (texts: KuromojinWord[]): MiteiruJapaneseWord[] => texts.map((item) => ({
  origin: item.surface_form,
  hiragana: toFuriganaHiragana(kuromojiReading(item)),
  basicForm: item.basic_form,
  pos: item.pos
    + (item.pos_detail_1 !== "*" ? `-${item.pos_detail_1}` : "")
    + (item.pos_detail_2 !== "*" ? `-${item.pos_detail_2}` : "")
    + (item.pos_detail_3 !== "*" ? `-${item.pos_detail_3}` : "")
}));

export const processKuromojinToSeparations = (
  texts: KuromojinWord[]
): MiteiruJapaneseWordWithSeparations[] => kuromojinToJapaneseWords(texts).map((word, index) => ({
  ...word,
  separation: splitOkuriganaCompact(
    word.origin,
    word.hiragana,
    spokenKana(kuromojiReading(texts[index]), texts[index].pronunciation)
  )
}));
