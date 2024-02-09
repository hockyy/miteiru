import {useCallback, useEffect, useState} from 'react';

const useLearningState = () => {
  const [learningState, setLearningState] = useState({});
  const [cachedLearningState, setCachedLearningState] = useState({});
  const changeLearningState = useCallback((content, value) => {
    // Invoke internal and change new state
    setCachedLearningState(cachedLearningState => ({
      ...cachedLearningState,
      content: value
    }));
  }, [setCachedLearningState]);
  const checkLearningState = useCallback((content) => {
    if(cachedLearningState[content]) return cachedLearningState[content];
    if(learningState[content]) return learningState[content];
    return 0;
  },[learningState, cachedLearningState]);
  useEffect(() => {
    // Invoke and load this from json file
    return;
  }, []);
  return {checkLearningState, changeLearningState};
};

export default useLearningState;
