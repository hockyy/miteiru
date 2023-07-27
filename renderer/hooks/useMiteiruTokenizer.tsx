import {useCallback, useEffect, useState} from 'react';
import {ipcRenderer} from "electron";
import {getFurigana, processKuromojinToSeparations} from "shunou";

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
    for (let i = 0; i < res.length - 1; i++) {
      const entry = res[i];
      if (entry.pos.split('-').includes("動詞")) {
        const taken = ['助動詞', '助詞']
        const ignorable = ['記号', '名詞']

        let nextPos;
        let accum = [entry];
        let itr = i + 1;
        do {
          nextPos = res[itr].pos.split('-')[0]
          if (!ignorable.includes(nextPos)) {
            accum.push(res[itr]);
            if (!taken.includes(nextPos)) {
            }
          } else break;
          itr++;
        } while (itr < res.length);
        console.log('--------')
        console.log(accum);
        const appended = accum.reduce((pre, curval) => {
          return pre + curval.origin;
        }, '');

        console.log(appended);
        i = itr - 1;
      }
    }
    return res;
  }, [tokenizerMode])
  return {tokenizeMiteiru, tokenizerMode};
};

export default useMiteiruTokenizer;
