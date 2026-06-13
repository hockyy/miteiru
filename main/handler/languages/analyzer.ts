import Conjugator from "jp-verbs";
import Japanese from "../japanese";
import Chinese from "../chinese";
import Vietnamese from "../vietnamese";
import {MiteiruJapaneseWordWithSeparations} from "./japaneseAnalysis";

export type AnalyzeTextOptions = {
  tokenizerMode: string;
  toneType?: string;
  mecabCommand?: string;
};

export type AnalyzeTextResult = any[];

export const parseJapaneseVerbs = async (
  res: MiteiruJapaneseWordWithSeparations[]
): Promise<MiteiruJapaneseWordWithSeparations[]> => {
  const newRes: MiteiruJapaneseWordWithSeparations[] = [];
  const VERB = "動詞";
  const RARERU = "られる";
  const IRU = "いる";
  const ARU = "ある";
  const SERU = 'せる';

  const YARI = "やり";
  const YARU = "やる";
  const SURU = 'する';
  const whitelist = [RARERU, IRU, ARU, SERU];
  const blacklist = [YARI, YARU, SURU];
  for (let i = 0; i < res.length; i++) {
    const entry = res[i];
    const isVerb = entry.pos.split('-').includes("動詞");
    if (!isVerb) {
      newRes.push(res[i]);
      continue;
    }
    const whitelistPos = ['助動詞', '助詞'];
    const isSpecialRule = (firstOne, index) => {
      const currentEntry = res[index];
      const currentPos = res[index].pos.split('-')[0];
      if (whitelist.includes(currentEntry.basicForm)) return true;
      if (blacklist.includes(currentEntry.basicForm)) return false;
      if (!whitelistPos.includes(currentPos)) {
        return false;
      }
      return !['と', 'でしょ', 'の', 'という'].includes(currentEntry.origin);

    }

    let accumIndex = [i];
    let accumVerb: string = '';
    let baseVerb: string = '';
    for (let itr = i + 1; itr < res.length; itr++) {
      if (isSpecialRule(res[i].basicForm, itr)) {
        accumIndex.push(itr);
      } else break;
    }
    let conjugationResult = null;
    do {
      if (accumIndex.length === 0) break;
      accumVerb = accumIndex.reduce((pre, curval) => {
        return pre + res[curval].origin;
      }, '');
      let currentUnconjugation: any[] = Conjugator.unconjugate(accumVerb);

      const baseIndex: number[] = [...accumIndex];
      do {
        const lastElement: number = baseIndex.pop();
        if (res[lastElement].basicForm === RARERU && baseIndex.length > 0) continue;
        if (res[lastElement].basicForm === IRU && baseIndex.length > 0) continue;
        if (res[lastElement].basicForm === ARU && baseIndex.length > 0) continue;
        if (res[lastElement].pos.split('-')[0] === VERB) {
          baseIndex.push(lastElement);
          break;
        }
      } while (baseIndex.length > 0);

      baseVerb = '';
      for (let j = 0; j < baseIndex.length - 1; j++) {
        baseVerb += res[baseIndex[j]].origin;
      }
      baseVerb += res[baseIndex[baseIndex.length - 1]].basicForm;
      currentUnconjugation = currentUnconjugation.filter(result => {
        return result.base === baseVerb;
      });
      if (currentUnconjugation.length > 0) {
        conjugationResult = currentUnconjugation[0];
      }

      if (conjugationResult === null) {
        accumIndex = baseIndex;
        if (accumIndex.length === 1) {
          conjugationResult = {base: res[accumIndex[0]].basicForm};
        } else {
          accumIndex.pop();
        }
      }
    } while (conjugationResult === null);
    newRes.push({
      origin: accumIndex.reduce((pre, curval) => {
        return pre + res[curval].origin;
      }, ''),
      hiragana: accumIndex.reduce((val, idx) => {
        return val + res[idx].hiragana;
      }, ''),
      basicForm: baseVerb,
      pos: res[i].pos,
      separation: accumIndex.reduce((val, idx) => {
        return val.concat(res[idx].separation);
      }, []),
    })
    i = accumIndex.pop();
  }
  return newRes;
};

export const analyzeText = async (
  sentence: string,
  {tokenizerMode, toneType = "num", mecabCommand}: AnalyzeTextOptions
): Promise<AnalyzeTextResult> => {
  if (!sentence) return [];

  if (tokenizerMode === "kuromoji") {
    const kuromojiEntries = await Japanese.tokenizeUsingKuromoji(sentence);
    const separated = Japanese.processKuromojinToSeparations(kuromojiEntries);
    return parseJapaneseVerbs(separated);
  }

  if (tokenizerMode === "cantonese") {
    return Chinese.getJyutpingForSentence(sentence, toneType);
  }

  if (tokenizerMode.includes("mecab")) {
    const separated = Japanese.getFurigana(sentence, mecabCommand ?? tokenizerMode);
    return parseJapaneseVerbs(separated);
  }

  if (tokenizerMode === "jieba") {
    return Chinese.tokenizeUsingJieba(sentence, toneType);
  }

  if (tokenizerMode === "vietnamese") {
    if (!Vietnamese.isLoaded) {
      throw new Error("Vietnamese dictionary not loaded");
    }
    return Vietnamese.tokenizeLongestSuffix(sentence);
  }

  return [];
};
