import {useState} from 'react';
import {SubtitleContainer} from "../components/Subtitle/DataStructures";
import {defaultPrimarySubtitleStyling} from "../utils/CJKStyling";
import {useStoreData} from "./useStoreData";

const useSubtitle = () => {
  const [primarySub, setPrimarySub] = useState(new SubtitleContainer(''));
  const [primaryShift, setPrimaryShift] = useState(0);
  const [primaryStyling, setPrimaryStyling] = useStoreData('user.styling.primary', defaultPrimarySubtitleStyling);

  const [secondarySub, setSecondarySub] = useState(new SubtitleContainer(''));
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
