import {useCallback, useEffect, useState} from 'react';
import {useStoreData} from "./useStoreData";
import {getLanguageModeByTokenizerMode} from "../languages/manifest";
import {setLearningLanguage} from "../utils/fonts";

const useMiteiruTokenizer = (): {
  tokenizeMiteiru: (sentence: string, toneType?: string) => Promise<any[]>,
  tokenizerMode: string,
  lang: string,
  /**
   * False until the backend has said which language is loaded. `lang` is '' until then as well, so
   * a page that says "choose a language" waits for this, or the message flashes on every visit.
   */
  tokenizerModeLoaded: boolean,
  toneType: string,
  setToneType
} => {
  const [tokenizerMode, setMode] = useState('');
  const [tokenizerModeLoaded, setTokenizerModeLoaded] = useState(false);
  const [toneType, setToneType] = useStoreData('toneType', 'num');
  useEffect(() => {
    window.backend.invoke('getTokenizerMode').then((val) => {
      setMode(val);
      setTokenizerModeLoaded(true);
    }, (error) => {
      // Counted as no language loaded: pages then say where to choose one instead of waiting.
      console.error('Could not read which language is loaded:', error);
      setTokenizerModeLoaded(true);
    });
  }, []);
  const lang = getLanguageModeByTokenizerMode(tokenizerMode)?.languageCode ?? '';
  // The default subtitle font follows the language being learned (globals.css).
  useEffect(() => setLearningLanguage(lang), [lang]);
  const tokenizeMiteiru = useCallback(async (sentence) => {
    if (!sentence) {
      return [];
    }
    return window.backend.invoke('analyzeText', sentence, toneType);
  }, [toneType]);
  return {
    tokenizeMiteiru,
    tokenizerMode,
    lang,
    tokenizerModeLoaded,
    toneType,
    setToneType,
  };
};

export default useMiteiruTokenizer;
