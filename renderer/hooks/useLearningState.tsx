import {useCallback, useEffect, useState} from 'react';
import {defaultLearningColorStyling} from "../utils/CJKStyling";
import {ipcRenderer} from "electron";

const useLearningState = () => {
  const [learningState, setLearningState] = useState({});
  const [cachedLearningState, setCachedLearningState] = useState({});

  const getLearningState = useCallback((content) => {
    if (content in cachedLearningState) {
      return cachedLearningState[content];
    }
    if (content in learningState) {
      return learningState[content];
    }
    return 0;
  }, [learningState, cachedLearningState]);

  const getLearningStateClass = useCallback((content) => {
    return `state${getLearningState(content)}`
  }, [getLearningState]);

  const changeLearningState = useCallback((content) => {
    setCachedLearningState(oldCached => {
      const newCopy = {...oldCached};
      const currentState = getLearningState(content);
      const nextVal = (currentState + 1) % defaultLearningColorStyling.learningColor.length
      newCopy[content] = nextVal;
      ipcRenderer.invoke('updateContent', content, nextVal);
      return newCopy;
    });
  }, [getLearningState]);

  useEffect(() => {
    ipcRenderer.invoke('loadLearningState').then((val) => {
      setLearningState(val);
    })
  }, []);
  return {getLearningStateClass, getLearningState, changeLearningState};
}

export default useLearningState;
