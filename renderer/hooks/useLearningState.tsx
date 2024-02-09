import {useCallback, useEffect, useState} from 'react';
import {defaultLearningColorStyling} from "../utils/CJKStyling";

const useLearningState = () => {
  const [learningState, setLearningState] = useState({});
  const [cachedLearningState, setCachedLearningState] = useState({});
  const checkLearningState = useCallback((content) => {
    if (cachedLearningState[content]) return cachedLearningState[content];
    if (learningState[content]) return learningState[content];
    return 0;
  }, [learningState, cachedLearningState]);
  const changeLearningState = useCallback((content) => {
    // Invoke internal and change new state
    setCachedLearningState(cachedLearningState => ({
      ...cachedLearningState,
      content: (checkLearningState(content) + 1) % defaultLearningColorStyling.learningColor.length
    }));
  }, [setCachedLearningState, checkLearningState]);
  useEffect(() => {
    // Invoke and load this from json file
    return;
  }, []);
  return {checkLearningState, changeLearningState};
};

export default useLearningState;
