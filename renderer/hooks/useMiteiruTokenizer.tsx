import {useState, useEffect, useCallback} from 'react';
import {ipcRenderer} from "electron";
import {getFurigana} from "shunou";

const useMiteiruTokenizer = (): { tokenizeMiteiru: (sentence: string) => Promise<any[]>, tokenizerMode: string } => {
  const [tokenizerMode, setMode] = useState('');

  useEffect(() => {
    ipcRenderer.invoke('getTokenizerMode').then(val => {
      setMode(val);
    });
  }, []);
  const tokenizeMiteiru = useCallback(async (sentence) => {
    if (tokenizerMode === '') return '';
    if (tokenizerMode === 'kuromoji') return await ipcRenderer.invoke('tokenizeUsingKuromoji', sentence);
    return getFurigana(sentence, tokenizerMode);
  }, [])
  return {tokenizeMiteiru, tokenizerMode};
};

export default useMiteiruTokenizer;
