import {useState} from 'react';
import {SubtitleContainer} from "../components/DataStructures";
import {defaultPrimarySubtitleStyling, defaultSecondarySubtitleStyling} from "../utils/CJKStyling";
import {useStoreData} from "./useStoreData";

const useSubtitle = (mecab) => {
  const [primarySub, setPrimarySub] = useState(new SubtitleContainer('', mecab));
  const [primaryShift, setPrimaryShift] = useState(0);
  const [primaryStyling, setPrimaryStyling] = useStoreData('user.styling.primary', defaultPrimarySubtitleStyling);

  const [secondarySub, setSecondarySub] = useState(new SubtitleContainer('', mecab));
  const [secondaryShift, setSecondaryShift] = useState(0);
  const [secondaryStyling, setSecondaryStyling] = useStoreData('user.styling.secondary', defaultPrimarySubtitleStyling);

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
    setSecondaryStyling
  };
};

export default useSubtitle;
