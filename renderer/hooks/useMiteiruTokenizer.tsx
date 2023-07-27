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
      return res;
    } else if(tokenizerMode !== '') {
      res = getFurigana(sentence, tokenizerMode);
    }
    return res;
  }, [tokenizerMode])
  return {tokenizeMiteiru, tokenizerMode};
};

export default useMiteiruTokenizer;
