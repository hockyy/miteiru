import {useCallback, useEffect, useState} from 'react';
import {ipcRenderer} from "electron";
import {getFurigana, processKuromojinToSeparations} from "shunou";
import Conjugator from 'jp-verbs';

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
    const VERB = "動詞";
    for (let i = 0; i < res.length; i++) {
      const entry = res[i];
      if (entry.pos.split('-').includes("動詞")) {
        const taken = ['助動詞', '助詞']
        const ignorable = ['記号', '名詞']
        // Multiple verb merged! uncomment if want to use
        // ignorable.push("動詞");
        const isSpecialRule = (res) => {
          if (res.origin === 'と') {
            return false;
          }
          return true;
        }

        let nextPos;
        let accumIndex = [i];
        for (let itr = i + 1; itr < res.length; itr++) {
          nextPos = res[itr].pos.split('-')[0];
          if (!ignorable.includes(nextPos) && isSpecialRule(res[itr])) {
            accumIndex.push(itr);
            // if (!taken.includes(nextPos)) {
            // }
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
          const accumVerb: string = accumIndex.reduce((pre, curval) => {
            return pre + res[curval].origin;
          }, '');
          let currentUnconjugation: any[] = Conjugator.unconjugate(accumVerb);


          // baseVerb = V + P + P + V + P + V.base
          const baseIndex: number[] = [...accumIndex];
          do {
            const lastElement: number = baseIndex.pop();
            if (res[lastElement].pos.split('-')[0] === VERB) {
              baseIndex.push(lastElement);
              break;
            }
          } while (baseIndex.length > 0);
          let baseVerb = '';
          for (let j = 0; j < baseIndex.length - 1; j++) {
            baseVerb += res[baseIndex[j]].origin;
          }
          baseVerb += res[baseIndex[baseIndex.length - 1]].basicForm;

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
              conjugationResult = {base: baseVerb};
            } else {
              // set accumVerb := V + P + P + V + P
              accumIndex.pop();
            }
          }
        } while (conjugationResult === null);
        console.log(conjugationResult);
        i = accumIndex.pop();
      }
    }
    return res;
  }, [tokenizerMode])
  return {tokenizeMiteiru, tokenizerMode};
};

export default useMiteiruTokenizer;
