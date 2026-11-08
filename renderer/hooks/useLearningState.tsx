import {useCallback, useEffect, useRef, useState} from 'react';
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

  // Entries saved since the last render, so two quick clicks build on each other.
  const savedEntries = useRef<Record<string, LearningStateType>>({});

  // State updaters must stay pure (React may call them twice), so the IPC write happens outside.
  const saveLearningEntry = useCallback((content: string, entry: LearningStateType) => {
    savedEntries.current[content] = entry;
    setCachedLearningState((oldCached) => ({...oldCached, [content]: entry}));
    window.backend.invoke('updateContent', content, lang, entry);
    setRefreshTrigger((prev) => prev + 1);
  }, [lang]);

  /** Moves the word to the next level (New, Learning, Known, then New again) and returns that level. */
  const changeLearningState = useCallback((content: string): number | undefined => {
    if (!content) return undefined;
    const currentLevel = savedEntries.current[content]?.level ?? getLearningState(content);
    const nextLevel = (currentLevel + 1) % videoConstants.learningStateLength;
    saveLearningEntry(content, {level: nextLevel, updTime: Date.now()});
    return nextLevel;
  }, [getLearningState, saveLearningEntry]);

  /** Saves the word at a chosen level (0 New, 1 Learning, 2 Known), as the three-part control in the popup does. */
  const setLearningLevel = useCallback((content: string, level: number) => {
    if (!content) return;
    saveLearningEntry(content, {level, updTime: Date.now()});
  }, [saveLearningEntry]);

  const updateTimeWithSameLevel = useCallback((content: string, updTime: number) => {
    if (!content) return;
    saveLearningEntry(content, {level: savedEntries.current[content]?.level ?? getLearningState(content), updTime});
  }, [getLearningState, saveLearningEntry]);

  // The language the saved words in learningState were loaded for (null until the first load).
  const [loadedLang, setLoadedLang] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.backend.invoke('loadLearningState', lang).then((val) => {
      // A load for a language already switched away from must not land over the new one's.
      if (cancelled) return;
      // With no language yet the backend answers nothing; `in` needs an object to search.
      setLearningState(val ?? {});
      setLoadedLang(lang);
    }, (error) => {
      if (cancelled) return;
      // Counted as no saved words, so pages waiting on savedWords (Flashcards) don't wait forever.
      console.error('Could not load the saved words:', error);
      setLearningState({});
      setLoadedLang(lang);
    });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  useEffect(() => {
    setAnalysis(sortAndFilterTopXPercentToJson(frequencyPrimary, learningPercentage));
  }, [frequencyPrimary, learningPercentage]);

  return {
    getLearningStateClass,
    getLearningState,
    changeLearningState,
    setLearningLevel,
    frequencyPrimary,
    setFrequencyPrimary,
    learningPercentage,
    setLearningPercentage,
    updateTimeWithSameLevel,
    refreshTrigger,
    // Every saved word as loaded for this language (later saves go to cachedLearningState), or
    // null while it loads. Shared so the page doesn't load all of them a second time.
    savedWords: loadedLang === lang ? learningState as Record<string, LearningStateType> : null,
  };
}

export default useLearningState;
