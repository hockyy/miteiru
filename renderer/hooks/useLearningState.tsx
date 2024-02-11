import {useCallback, useEffect, useState} from 'react';
import {defaultLearningColorStyling} from "../utils/CJKStyling";
import {ipcRenderer} from "electron";
import {sortAndFilterTopXPercentToJson} from "../utils/utils";

const useLearningState = (lang: string) => {
  const [learningState, setLearningState] = useState({});
  const [cachedLearningState, setCachedLearningState] = useState({});
  const [analysis, setAnalysis] = useState({});
  const [frequencyPrimary, setFrequencyPrimary] = useState(new Map<string, number>);

  const getLearningState = useCallback((content) => {
    if (content in cachedLearningState) {
      return cachedLearningState[content];
    }
    if (content in learningState) {
      return learningState[content];
    }
    if (content in analysis) {
      return 1;
    }
    return 0;
  }, [cachedLearningState, learningState, analysis]);

  const getLearningStateClass = useCallback((content) => {
    return `state${getLearningState(content)}`
  }, [getLearningState]);

  const changeLearningState = useCallback((content) => {
    setCachedLearningState(oldCached => {
      if (!content) return oldCached;
      const newCopy = {...oldCached};
      const currentState = getLearningState(content);
      const nextVal = (currentState + 1) % defaultLearningColorStyling.learningColor.length
      newCopy[content] = nextVal;
      ipcRenderer.invoke('updateContent', content, nextVal, lang);
      return newCopy;
    });
  }, [getLearningState, lang]);

  useEffect(() => {
    ipcRenderer.invoke('loadLearningState', lang).then((val) => {
      setLearningState(val);
    })
  }, [lang]);

  useEffect(() => {
    console.log({...frequencyPrimary.entries()});
    setAnalysis(sortAndFilterTopXPercentToJson(frequencyPrimary, 50));
  }, [frequencyPrimary]);
  return {
    getLearningStateClass,
    getLearningState,
    changeLearningState,
    frequencyPrimary,
    setFrequencyPrimary
  };
}

export default useLearningState;
