import {useMemo} from 'react';
import {CJKStyling} from "../utils/CJKStyling";

const useSubtitleContainerStyle = (subtitleStyling: CJKStyling, extraContainerStyle: React.CSSProperties) => {
  return useMemo(() => {
    return {
      ...extraContainerStyle,
      fontFamily: subtitleStyling.text.fontFamily,
      fontWeight: subtitleStyling.text.weight,
      fontSize: subtitleStyling.text.fontSize,
      [subtitleStyling.positionFromTop ? 'top' : 'bottom']: subtitleStyling.position,
    };
  }, [subtitleStyling, extraContainerStyle]);
};

export default useSubtitleContainerStyle;
