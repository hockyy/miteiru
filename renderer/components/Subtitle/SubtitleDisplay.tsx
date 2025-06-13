import React from "react";
import {PrimarySubtitle, SecondarySubtitle} from "./Subtitle";
import {ScrollingLyrics} from "./ScrollingLyrics";
import {SubtitleContainer} from "./DataStructures";
import {CJKStyling} from "../../utils/CJKStyling";
import {SubtitleMode} from "../../utils/utils";

interface SubtitleDisplayProps {
  // Primary subtitle props
  showPrimarySub: boolean;
  setMeaning: (newMeaning: string) => void;
  currentTime: number;
  primarySub: SubtitleContainer;
  primaryShift: number;
  primaryStyling: CJKStyling;
  getLearningStateClass?: (newMeaning: string) => string;
  changeLearningState?: (newMeaning: string) => void;
  primaryTimeCache?: number[];
  setPrimaryTimeCache?: (cache: number[]) => void;
  setExternalContent?: (content: any[]) => void;
  setRubyCopyContent: any;

  // Secondary subtitle props
  showSecondarySub: boolean;
  secondarySub: SubtitleContainer;
  secondaryShift: number;
  secondaryStyling: CJKStyling;
  secondaryTimeCache?: number[];
  setSecondaryTimeCache?: (cache: number[]) => void;

  // Mode
  subtitleMode: SubtitleMode;
}

export const SubtitleDisplay = ({
  // Primary props
  showPrimarySub,
  setMeaning,
  currentTime,
  primarySub,
  primaryShift,
  primaryStyling,
  getLearningStateClass,
  changeLearningState,
  primaryTimeCache,
  setPrimaryTimeCache,
  setExternalContent,
  setRubyCopyContent,

  // Secondary props
  showSecondarySub,
  secondarySub,
  secondaryShift,
  secondaryStyling,
  secondaryTimeCache,
  setSecondaryTimeCache,

  // Mode
  subtitleMode
}: SubtitleDisplayProps) => {

  // Karaoke mode: only show scrolling lyrics, no secondary subtitle
  if (subtitleMode === SubtitleMode.Karaoke) {
    return (
      <>
        {showPrimarySub && (
          <ScrollingLyrics
            currentTime={currentTime}
            subtitle={primarySub}
            shift={primaryShift}
            setMeaning={setMeaning}
            subtitleStyling={primaryStyling}
            changeLearningState={changeLearningState}
            getLearningStateClass={getLearningStateClass}
            setExternalContent={setExternalContent}
            setRubyCopyContent={setRubyCopyContent}
          />
        )}
      </>
    );
  }

  // Normal mode: show both primary and secondary subtitles as before
  return (
    <>
      {showPrimarySub && (
        <PrimarySubtitle
          setMeaning={setMeaning}
          currentTime={currentTime}
          subtitle={primarySub}
          shift={primaryShift}
          subtitleStyling={primaryStyling}
          getLearningStateClass={getLearningStateClass}
          changeLearningState={changeLearningState}
          timeCache={primaryTimeCache}
          setTimeCache={setPrimaryTimeCache}
          setExternalContent={setExternalContent}
          setRubyCopyContent={setRubyCopyContent}
        />
      )}
      {showSecondarySub && (
        <SecondarySubtitle
          currentTime={currentTime}
          subtitle={secondarySub}
          shift={secondaryShift}
          subtitleStyling={secondaryStyling}
          timeCache={secondaryTimeCache}
          setTimeCache={setSecondaryTimeCache}
        />
      )}
    </>
  );
};
