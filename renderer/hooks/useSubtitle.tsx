import {useState} from 'react';
import {SubtitleContainer} from "../components/DataStructures";
import {defaultPrimarySubtitleStyling, defaultSecondarySubtitleStyling} from "../utils/CJKStyling";
import {useStoreData} from "./useStoreData";

const useSubtitle = (miteiruApi, mecab) => {
  const [primarySub, setPrimarySub] = useState(new SubtitleContainer('', mecab, miteiruApi));
  const [primaryShift, setPrimaryShift] = useState(0);
  const [primaryStyling, setPrimaryStyling] = useStoreData(miteiruApi, 'user.styling.primary', defaultPrimarySubtitleStyling);

  const [secondarySub, setSecondarySub] = useState(new SubtitleContainer('', mecab, miteiruApi));
  const [secondaryShift, setSecondaryShift] = useState(0);
  const [secondaryStyling, setSecondaryStyling] = useStoreData(miteiruApi, 'user.styling.secondary', defaultSecondarySubtitleStyling);

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
