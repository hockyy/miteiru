import {useCallback, useEffect, useState} from 'react';
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
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Trigger for vocabulary refresh

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

  // State updaters must stay pure (React may call them twice), so the IPC write happens outside.
  const saveLearningEntry = useCallback((content: string, entry: { level: number; updTime: number }) => {
    setCachedLearningState((oldCached) => ({...oldCached, [content]: entry}));
    window.ipc.invoke('updateContent', content, lang, entry);
    setRefreshTrigger((prev) => prev + 1);
  }, [lang]);

  const changeLearningState = useCallback((content: string) => {
    if (!content) return;
    const nextLevel = (getLearningState(content) + 1) % videoConstants.learningStateLength;
    saveLearningEntry(content, {level: nextLevel, updTime: Date.now()});
  }, [getLearningState, saveLearningEntry]);

  const updateTimeWithSameLevel = useCallback((content: string, updTime: number) => {
    if (!content) return;
    saveLearningEntry(content, {level: getLearningState(content), updTime});
  }, [getLearningState, saveLearningEntry]);

  useEffect(() => {
    window.ipc.invoke('loadLearningState', lang).then((val) => {
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
    setLearningPercentage,
    updateTimeWithSameLevel,
    refreshTrigger
  };
}

export default useLearningState;
