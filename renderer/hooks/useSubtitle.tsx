import { useState, useCallback } from 'react';
import { SubtitleContainer } from "../components/DataStructures";
import {defaultPrimarySubtitleStyling, defaultSecondarySubtitleStyling} from "../utils/CJKStyling";

const useSubtitle = (mecab) => {
  const [primarySub, setPrimarySub] = useState(new SubtitleContainer('', mecab));
  const [primaryShift, setPrimaryShift] = useState(0);
  const [primaryStyling, setPrimaryStyling] = useState(defaultPrimarySubtitleStyling);

  const [secondarySub, setSecondarySub] = useState(new SubtitleContainer('', mecab));
  const [secondaryShift, setSecondaryShift] = useState(0);
  const [secondaryStyling, setSecondaryStyling] = useState(defaultSecondarySubtitleStyling);

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
