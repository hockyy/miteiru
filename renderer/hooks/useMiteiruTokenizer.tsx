import {useCallback, useEffect, useState} from 'react';
import {ipcRenderer} from "electron";
import {getFurigana, processKuromojinToSeparations, ShunouWordWithSeparations} from "shunou";
import Conjugator from 'jp-verbs';

const parseRes = async (res) => {
  const newRes: ShunouWordWithSeparations[] = [];
  const VERB = "動詞";
  const RARERU = "られる";
  const IRU = "いる";
  const ARU = "ある";
  const YARI = "やり";
  const SURU = 'する';
  for (let i = 0; i < res.length; i++) {
    const entry = res[i];
    const isVerb = entry.pos.split('-').includes("動詞");
    if (!isVerb) {
      newRes.push(res[i]);
      continue;
    }
    const taken = ['助動詞', '助詞'];
    const ignorable = ['記号', '名詞'];
    // Multiple verb merged! uncomment if want to use
    taken.push(VERB);
    const isSpecialRule = (firstOne, itr) => {
      const currentEntry = res[itr];
      const currentPos = res[itr].pos.split('-')[0];
      if (firstOne === SURU &&
          currentPos === VERB &&
          currentEntry.origin != IRU &&
          currentEntry.origin != ARU) return false;

      if (currentEntry.origin === YARI || currentEntry.origin === SURU) return false;
      if (!taken.includes(currentPos)) {
        return false;
      }
      if (['と', 'でしょ', 'の'].includes(currentEntry.origin)) {
        return false;
      }
      return true;
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
      // Generate current verb (conjugated)
      // V = verb
      // P = inflections
      // V P P V P V P P
      // accumVerb = V + P + P + V + P + V + P + P
      accumVerb = accumIndex.reduce((pre, curval) => {
        return pre + res[curval].origin;
      }, '');
      let currentUnconjugation: any[] = Conjugator.unconjugate(accumVerb);


      // baseVerb = V + P + P + V + P + V.base
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
      // const existance = await ipcRenderer.invoke('exactQuery', baseVerb);
      // if(existance.length === 0) baseVerb = '';
      // Filter all unconjugation result and find the correct base
      currentUnconjugation = currentUnconjugation.filter(result => {
        return result.base === baseVerb;
      });
      if (currentUnconjugation.length > 0) {
        conjugationResult = currentUnconjugation[0];
      }

      // If still null,
      if (conjugationResult === null) {
        // set accumVerb := V + P + P + V + P + V.base
        accumIndex = baseIndex;
        if (accumIndex.length === 1) {
          // if accumVerb = V.base
          conjugationResult = {base: res[accumIndex[0]].basicForm};
        } else {
          // set accumVerb := V + P + P + V + P
          accumIndex.pop();
        }
      }
    } while (conjugationResult === null);
    newRes.push({
      origin: accumVerb,
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
  console.log(res, newRes)
  return newRes;
}

const useMiteiruTokenizer = (): { tokenizeMiteiru: (sentence: string) => Promise<any[]>, tokenizerMode: string } => {
  const [tokenizerMode, setMode] = useState('');

  useEffect(() => {
    ipcRenderer.invoke('getTokenizerMode').then(val => {
      setMode(val);
    });
  }, []);
  const tokenizeMiteiru = useCallback(async (sentence) => {
    let res = []
    if (tokenizerMode === 'kuromoji') {
      const kuromojiEntries = await ipcRenderer.invoke('tokenizeUsingKuromoji', sentence)
      res = processKuromojinToSeparations(kuromojiEntries);
    } else if (tokenizerMode !== '') {
      res = getFurigana(sentence, tokenizerMode);
    }
    res = await parseRes(res);
    return res;
  }, [tokenizerMode])
  return {tokenizeMiteiru, tokenizerMode};
};

export default useMiteiruTokenizer;
