import React, {memo} from "react";
import {CJKStyling} from "../../utils/CJKStyling";
import {PrimarySubtitle} from "./Subtitle";
import {useLiveCaptionSubtitle} from "./useLiveCaptionSubtitle";

interface LiveCaptionOverlayProps {
  caption: string;
  subtitleStyling: CJKStyling;
  lang: string;
  tokenizeMiteiru: (text: string) => Promise<any[]>;
  setMeaning: (newMeaning: string) => void;
  getLearningStateClass?: (newMeaning: string) => string;
  changeLearningState?: (newMeaning: string) => void;
  setExternalContent?: (content: any[]) => void;
  setRubyCopyContent: any;
}

export const LiveCaptionOverlay = memo(({
  caption,
  subtitleStyling,
  lang,
  tokenizeMiteiru,
  setMeaning,
  getLearningStateClass,
  changeLearningState,
  setExternalContent,
  setRubyCopyContent
}: LiveCaptionOverlayProps) => {
  const {
    liveSubtitle,
    liveTimeCache,
    setLiveTimeCache
  } = useLiveCaptionSubtitle(caption, lang, tokenizeMiteiru);

  if (!caption || liveSubtitle.lines.length === 0) return null;

  return (
    <PrimarySubtitle
      currentTime={0}
      subtitle={liveSubtitle}
      shift={0}
      setMeaning={setMeaning}
      subtitleStyling={subtitleStyling}
      getLearningStateClass={getLearningStateClass}
      changeLearningState={changeLearningState}
      timeCache={liveTimeCache}
      setTimeCache={setLiveTimeCache}
      setExternalContent={setExternalContent}
      setRubyCopyContent={setRubyCopyContent}
    />
  );
});

LiveCaptionOverlay.displayName = "LiveCaptionOverlay";
