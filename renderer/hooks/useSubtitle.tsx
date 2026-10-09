import {useState} from 'react';
import {SubtitleContainer} from "../components/Subtitle/DataStructures";
import {defaultPrimarySubtitleStyling, defaultSecondarySubtitleStyling} from "../utils/CJKStyling";
import {useStoreData} from "./useStoreData";
import {withCurrentDefaultFont} from "../utils/fonts";

const useSubtitle = () => {
  const [primarySub, setPrimarySub] = useState(new SubtitleContainer(''));
  const [primaryShift, setPrimaryShift] = useState(0);
  const [primaryStyling, setPrimaryStyling] = useStoreData('user.styling.primary', defaultPrimarySubtitleStyling, withCurrentDefaultFont);
  const [showPrimarySub, setShowPrimarySub] = useState(true);
  const [primaryTimeCache, setPrimaryTimeCache] = useState([])

  const [secondarySub, setSecondarySub] = useState(new SubtitleContainer(''));
  const [secondaryShift, setSecondaryShift] = useState(0);
  const [secondaryStyling, setSecondaryStyling] = useStoreData('user.styling.secondary', defaultSecondarySubtitleStyling, withCurrentDefaultFont);
  const [showSecondarySub, setShowSecondarySub] = useState(true);
  const [secondaryTimeCache, setSecondaryTimeCache] = useState([])

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
    showPrimarySub,
    setShowPrimarySub,
    showSecondarySub,
    setShowSecondarySub,
    primaryTimeCache,
    setPrimaryTimeCache,
    secondaryTimeCache,
    setSecondaryTimeCache,

  };
};

export default useSubtitle;
