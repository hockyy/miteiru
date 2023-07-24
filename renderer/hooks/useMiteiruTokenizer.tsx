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
    if (tokenizerMode === '') return '';
    if (tokenizerMode === 'kuromoji') {
      let res = await ipcRenderer.invoke('tokenizeUsingKuromoji', sentence)
      res = processKuromojinToSeparations(res);
      return res;
    }
    return getFurigana(sentence, tokenizerMode);
  }, [tokenizerMode])
  return {tokenizeMiteiru, tokenizerMode};
};

export default useMiteiruTokenizer;
