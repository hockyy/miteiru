import {useCallback, useEffect, useState} from 'react';
import {ipcRenderer} from "electron";
import {sortAndFilterTopXPercentToJson} from "../utils/utils";
import {videoConstants} from "../utils/constants";
import {useStoreData} from "./useStoreData";
import {LearningStateType} from "../components/types";

const useLearningState = (lang: string) => {
  const [learningState, setLearningState] = useState({});
  const [cachedLearningState, setCachedLearningState] = useState({});
  const [analysis, setAnalysis] = useState({});
  const [frequencyPrimary, setFrequencyPrimary] = useState(new Map<string, number>);
  const [learningPercentage, setLearningPercentage] = useStoreData('learningPercentage', 30);

  const getLearningState = useCallback((content: string): number => {
    if (content in cachedLearningState) {
      return (cachedLearningState[content] as LearningStateType).level;
    }
    if (content in learningState) {
      return (learningState[content] as LearningStateType).level;
    }
    if (content in analysis) {
      return 3;
    }
    return 0;
  }, [cachedLearningState, learningState, analysis]);

  const getLearningStateClass = useCallback((content) => {
    return `state${getLearningState(content)}`
  }, [getLearningState]);

  const changeLearningState = useCallback((content: string) => {
    setCachedLearningState(oldCached => {
      if (!content) return oldCached;
      const newCopy = {...oldCached};
      const currentState = getLearningState(content);
      const nextVal = (currentState + 1) % videoConstants.learningStateLength;
      const updTime = Date.now();
      newCopy[content] = {
        level: nextVal,
        updTime: updTime
      };
      ipcRenderer.invoke('updateContent', content, lang, newCopy[content]);
      return newCopy;
    });
  }, [getLearningState, lang]);

  useEffect(() => {
    ipcRenderer.invoke('loadLearningState', lang).then((val) => {
      setLearningState(val);
    })
  }, [lang]);

  useEffect(() => {
    setAnalysis(sortAndFilterTopXPercentToJson(frequencyPrimary, learningPercentage));
  }, [frequencyPrimary, learningPercentage]);

  return {
    getLearningStateClass,
    getLearningState,
    changeLearningState,
    frequencyPrimary,
    setFrequencyPrimary,
    learningPercentage,
    setLearningPercentage
  };
}

export default useLearningState;
