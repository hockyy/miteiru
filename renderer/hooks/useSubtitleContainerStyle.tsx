import {useMemo} from 'react';
import {CJKStyling} from "../utils/CJKStyling";

const useSubtitleContainerStyle = (subtitleStyling: CJKStyling, extraContainerStyle: React.CSSProperties) => {
  return useMemo(() => {
    return {
      ...extraContainerStyle,
      fontFamily: subtitleStyling.text.fontFamily,
      fontWeight: subtitleStyling.text.weight,
      fontSize: subtitleStyling.text.fontSize,
      // A subtitle at the top moves below the player's top bar while the bar shows (globals.css).
      ...(subtitleStyling.positionFromTop
        ? {top: `max(${subtitleStyling.position}, var(--subtitle-inset-top, 0px))`}
        : {bottom: subtitleStyling.position}),
      // Open side panels narrow the line instead of covering it (the video page sets these).
      left: 'var(--subtitle-inset-left, 0px)',
      right: 'var(--subtitle-inset-right, 0px)',
    };
  }, [subtitleStyling, extraContainerStyle]);
};

export default useSubtitleContainerStyle;
