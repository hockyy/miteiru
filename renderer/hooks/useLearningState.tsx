import {useCallback, useEffect, useState} from 'react';
import {defaultLearningColorStyling} from "../utils/CJKStyling";

const useLearningState = () => {
  const [learningState, setLearningState] = useState({});
  const [cachedLearningState, setCachedLearningState] = useState({});

  const checkLearningState = useCallback((content) => {
    if (content in cachedLearningState) {
      return cachedLearningState[content];
    }
    if (content in learningState) {
      return learningState[content];
    }
    return 0;
  }, [learningState, cachedLearningState]);

  const changeLearningState = useCallback((content) => {
    setCachedLearningState(oldCached => {
      const newCopy = {...oldCached};
      const currentState = checkLearningState(content);
      newCopy[content] = (currentState + 1) % defaultLearningColorStyling.learningColor.length;

      return newCopy;
    });
  }, [checkLearningState, cachedLearningState]); // Simplified dependency array
  return {checkLearningState, changeLearningState};
}

export default useLearningState;
