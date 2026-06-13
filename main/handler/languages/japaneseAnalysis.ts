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
};

type RunResponse = {
  ok: boolean;
  splittedSentences: string[];
};

const notOkRunAndSplitResponse: RunResponse = {ok: false, splittedSentences: []};
const notOkParseResponse: ParseResponse = {ok: false, pairs: []};

const anyOneTrue = (word: string, func: (value: string) => boolean) => {
  for (const ch of word) {
    if (func(ch)) return true;
  }
  return false;
};

const createStoredObject = (textMain: string, textHiragana: string): MiteiruJapaneseSeparation => ({
  main: textMain,
  hiragana: textHiragana,
  romaji: toRomaji(textHiragana),
  isKana: anyOneTrue(textMain, isKana),
  isKanji: anyOneTrue(textMain, isKanji),
  isMixed: anyOneTrue(textMain, isMixed)
});

const splitOkuriganaCompact = (text: string, reading?: string): MiteiruJapaneseSeparation[] => {
  let hiragana = reading;
  if (typeof hiragana === "undefined") {
    hiragana = text;
  } else if (hiragana === "*") {
    hiragana = toHiragana(text);
  }

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

  if (kanjiPointer[0] > 0) {
    stored.push(createStoredObject(
      text.substring(0, kanjiPointer[0]),
      hiragana.substring(0, kanjiPointer[0])
    ));
  }

  if (kanjiPointer[0] <= kanjiPointer[1]) {
    const spentBack = text.length - kanjiPointer[1];
    stored.push(createStoredObject(
      text.substring(kanjiPointer[0], kanjiPointer[1] + 1),
      hiragana.substring(kanjiPointer[0], hiragana.length - spentBack + 1)
    ));
  }

  if (kanjiPointer[0] <= kanjiPointer[1] && kanjiPointer[1] + 1 !== text.length) {
    const spentBack = text.length - kanjiPointer[1];
    stored.push(createStoredObject(
      text.substring(kanjiPointer[1] + 1, text.length),
      hiragana.substring(hiragana.length - spentBack + 1, hiragana.length)
    ));
  }

  return stored;
};

const runAndSplit = (text: string, mecabCommand: string, outputFormat: string): RunResponse => {
  const normalizedText = text.replace(/[^\S\n]/g, " ").trim();
  const result = spawnSync(`"${mecabCommand}"`, outputFormat !== "" ? ["-O", outputFormat] : [], {
    input: normalizedText,
    shell: true
  });

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
  const {ok, splittedSentences} = runAndSplit(text, mecabCommand, "chamame");
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
  if (!res.ok) {
    res = parseChasen(text, mecabCommand);
    if (!res.ok) {
      res = parseEmpty(text, mecabCommand);
    }
  }
  return separateJapaneseWords(res.pairs);
};

export const kuromojinToJapaneseWords = (texts: KuromojinWord[]): MiteiruJapaneseWord[] => texts.map((item) => ({
  origin: item.surface_form,
  hiragana: toHiragana(item.pronunciation),
  basicForm: item.basic_form,
  pos: item.pos
    + (item.pos_detail_1 !== "*" ? `-${item.pos_detail_1}` : "")
    + (item.pos_detail_2 !== "*" ? `-${item.pos_detail_2}` : "")
    + (item.pos_detail_3 !== "*" ? `-${item.pos_detail_3}` : "")
}));

export const processKuromojinToSeparations = (
  texts: KuromojinWord[]
): MiteiruJapaneseWordWithSeparations[] => separateJapaneseWords(kuromojinToJapaneseWords(texts));
