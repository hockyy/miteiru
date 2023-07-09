import { useState, useCallback } from 'react';
import { SubtitleContainer } from "../components/DataStructures";

const useSubtitle = (mecab, defaultPrimaryStyling, defaultSecondaryStyling) => {
  const [primarySub, setPrimarySub] = useState(new SubtitleContainer('', mecab));
  const [primaryShift, setPrimaryShift] = useState(0);
  const [primaryStyling, setPrimaryStyling] = useState(defaultPrimaryStyling);

  const [secondarySub, setSecondarySub] = useState(new SubtitleContainer('', mecab));
  const [secondaryShift, setSecondaryShift] = useState(0);
  const [secondaryStyling, setSecondaryStyling] = useState(defaultSecondaryStyling);

  const resetSub = useCallback((subSetter) => {
    subSetter(new SubtitleContainer('', mecab));
  }, [mecab]);

  return {
    primarySub,
    setPrimarySub,
    secondarySub,
    setSecondarySub,
    primaryShift,
    setPrimaryShift,
    secondaryShift,
    setSecondaryShift,
    primaryStyling,
    setPrimaryStyling,
    secondaryStyling,
    setSecondaryStyling,
    resetSub,
  };
};

export default useSubtitle;
