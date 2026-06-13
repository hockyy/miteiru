import {useCallback, useEffect, useState} from 'react';
import {useStoreData} from "./useStoreData";
import {getLanguageModeByTokenizerMode} from "../languages/manifest";

const useMiteiruTokenizer = (): {
  tokenizeMiteiru: (sentence: string, toneType?: string) => Promise<any[]>,
  tokenizerMode: string,
  lang: string,
  toneType: string,
  setToneType
} => {
  const [tokenizerMode, setMode] = useState('');
  const [toneType, setToneType] = useStoreData('toneType', 'num');
  useEffect(() => {
    window.ipc.invoke('getTokenizerMode').then(val => {
      setMode(val);
    });
  }, []);
  const tokenizeMiteiru = useCallback(async (sentence) => {
    if (!sentence) {
      return [];
    }
    return window.ipc.invoke('analyzeText', sentence, toneType);
  }, [toneType]);
  return {
    tokenizeMiteiru,
    tokenizerMode,
    lang: getLanguageModeByTokenizerMode(tokenizerMode)?.languageCode ?? '',
    toneType,
    setToneType,
  };
};

export default useMiteiruTokenizer;
