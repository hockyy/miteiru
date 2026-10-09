import React, {useEffect, useMemo, useRef, useState} from "react";
import {findLineIndexAt, NO_MEANING, SubtitleContainer} from "./DataStructures";
import {ChineseSentence, JapaneseSentence, PlainSentence} from "./Sentence";
import {CJKStyling, defaultSecondarySubtitleStyling} from "../../utils/CJKStyling";
import {adjustTimeWithShift} from "../../utils/utils";
import useSubtitleContainerStyle from "../../hooks/useSubtitleContainerStyle";
import {getSubtitleOutlineStyle} from "../../utils/subtitleStroke";
import {buildRubyCopyHtml, getSubtitleTokenPresentation} from "./subtitleLanguageSupport";
import type {PlaybackClock} from "../../utils/playbackClock";

interface CurrentSubtitleLine {
  content: any[] | string;
  meaning: any[];
}

const emptySubtitleLine: CurrentSubtitleLine = {
  content: '',
  meaning: NO_MEANING
};

const sameTimeCache = (left: number[] | undefined, right: number[]) => (
  left !== undefined && left.length === right.length && left.every((time, index) => time === right[index])
);

/**
 * The line shown at the clock's time (or at a fixed `currentTime` where there is no video). Runs a
 * binary search on every clock tick and re-renders only when the line, its tokens or its glosses
 * change, so tokens appear as soon as the background analysis reaches the current line.
 */
const useCurrentSubtitleLine = ({
  clock,
  currentTime = 0,
  subtitle,
  shift,
  timeCache,
  setTimeCache
}: {
  clock?: PlaybackClock,
  currentTime?: number,
  subtitle: SubtitleContainer,
  shift: number,
  timeCache?: number[],
  setTimeCache?: (cache: number[]) => void
}) => {
  const [line, setLine] = useState(emptySubtitleLine);
  const shownRef = useRef(emptySubtitleLine);

  // Also re-run when the caller resets the time cache: that is how it asks for a refresh while paused.
  useEffect(() => {
    let reportedCache = timeCache;
    const update = () => {
      const adjustedTime = adjustTimeWithShift(clock ? clock.get() : currentTime, shift);
      const index = findLineIndexAt(subtitle.lines, adjustedTime);
      const found = index >= 0 ? subtitle.lines[index] : null;
      const content = found ? found.content : '';
      const meaning = found?.meaning ?? NO_MEANING;
      if (shownRef.current.content !== content || shownRef.current.meaning !== meaning) {
        shownRef.current = content === '' && meaning === NO_MEANING ? emptySubtitleLine : {content, meaning};
        setLine(shownRef.current);
      }
      const nextCache = found ? [found.timeStart, found.timeEnd] : [];
      if (setTimeCache && !sameTimeCache(reportedCache, nextCache)) {
        reportedCache = nextCache;
        setTimeCache(nextCache);
      }
    };
    update();
    const unsubscribeClock = clock?.subscribe(update);
    const unsubscribeAnalysis = subtitle.onChange?.(update);
    return () => {
      unsubscribeClock?.();
      unsubscribeAnalysis?.();
    };
  }, [clock, currentTime, setTimeCache, shift, subtitle, timeCache]);

  return line;
};

const buildPrimaryCaption = ({
  content,
  wordMeaning = [],
  setMeaning,
  subtitleStyling,
  getLearningStateClass,
  changeLearningState
}: {
  content: any[] | string,
  wordMeaning?: any[],
  setMeaning: (newMeaning: string) => void,
  subtitleStyling?: CJKStyling,
  getLearningStateClass?: (newMeaning: string) => string,
  changeLearningState?: (newMeaning: string) => void
}) => {
    if (content === '' || content.length === 0) {
      return {
        caption: [],
        rubyCopyContent: ''
      };
    }

    if (typeof content === 'string') {
      return {
        caption: [<JapaneseSentence
          key={'only'}
          origin={""}
          separation={[{main: content}]}
          setMeaning={() => {
          }}
          extraClass={"subtitle"}
          subtitleStyling={subtitleStyling}
          wordMeaning={''}/>],
        rubyCopyContent: content
      };
    }

    const rubyCopyContent = buildRubyCopyHtml(content, Boolean(subtitleStyling?.showSpace));
    const caption = content.map((val, index) => {
      const validBasicForm = val.basicForm != '' && val.basicForm != '*';
      const presentation = getSubtitleTokenPresentation(val);

      return (
          <React.Fragment key={index}>
            {presentation.sentenceKind === "chinese" ? (
                <ChineseSentence
                    origin={val.origin}
                    separation={val.separation}
                    setMeaning={setMeaning}
                    extraClass={"subtitle"}
                    subtitleStyling={subtitleStyling}
                    basicForm={validBasicForm ? val.basicForm : ''}
                    wordMeaning={wordMeaning[index]}
                    getLearningStateClass={getLearningStateClass}
                    changeLearningState={changeLearningState}
                />
            ) : (
                <JapaneseSentence
                    origin={val.origin}
                    separation={val.separation}
                    setMeaning={setMeaning}
                    extraClass={"subtitle"}
                    subtitleStyling={subtitleStyling}
                    basicForm={validBasicForm ? val.basicForm : ''}
                    wordMeaning={wordMeaning[index]}
                    getLearningStateClass={getLearningStateClass}
                    changeLearningState={changeLearningState}
                />
            )}
            {index + 1 < content.length && subtitleStyling?.showSpace ? " " : " "}
          </React.Fragment>
      );
    });

    return {
      caption,
      rubyCopyContent
    };
};

export const PrimarySubtitle = ({
                                  clock,
                                  currentTime,
                                  subtitle,
                                  shift,
                                  setMeaning,
                                  subtitleStyling,
                                  changeLearningState,
                                  getLearningStateClass,
                                  timeCache,
                                  setTimeCache,
                                  setExternalContent,
                                  setRubyCopyContent
                                }: {
                                  clock?: PlaybackClock,
                                  currentTime?: number,
                                  subtitle: SubtitleContainer,
                                  shift: number,
                                  setMeaning: (newMeaning: string) => void,
                                  subtitleStyling?: CJKStyling,
                                  changeLearningState?: (newMeaning: string) => void,
                                  getLearningStateClass?: (newMeaning: string) => string,
                                  timeCache?: number[],
                                  setTimeCache?: (cache: number[]) => void,
                                  setExternalContent?: (content: any[] | string) => void,
                                  setRubyCopyContent: any;
                                }
) => {
  const line = useCurrentSubtitleLine({clock, currentTime, subtitle, shift, timeCache, setTimeCache});
  const {
    caption,
    rubyCopyContent
  } = useMemo(() => buildPrimaryCaption({
    content: line.content,
    wordMeaning: line.meaning,
    setMeaning,
    subtitleStyling,
    getLearningStateClass,
    changeLearningState
  }), [changeLearningState, getLearningStateClass, line.content, line.meaning, setMeaning, subtitleStyling]);

  useEffect(() => {
    setExternalContent?.(line.content);
  }, [line.content, setExternalContent]);

  useEffect(() => {
    setRubyCopyContent(rubyCopyContent);
  }, [rubyCopyContent, setRubyCopyContent]);

  return <Subtitle caption={caption} subtitleStyling={subtitleStyling}/>
};

export const SecondarySubtitle = ({
                                    clock,
                                    subtitle,
                                    shift,
                                    subtitleStyling = defaultSecondarySubtitleStyling,
                                    timeCache,
                                    setTimeCache
                                  }: {
                                    clock: PlaybackClock,
                                    subtitle: SubtitleContainer,
                                    shift: number,
                                    subtitleStyling?: CJKStyling,
                                    timeCache?: number[],
                                    setTimeCache?: (cache: number[]) => void;
                                  }
) => {
  const line = useCurrentSubtitleLine({clock, subtitle, shift, timeCache, setTimeCache});
  const caption = useMemo(() => {
    const content = line.content;
    if (content === '' || content.length === 0) {
      return [];
    }

    return [<PlainSentence key="secondary" origin={content}/>];
  }, [line.content]);

  return <Subtitle caption={caption} subtitleStyling={subtitleStyling} extraContainerStyle={{
    WebkitTextFillColor: subtitleStyling.text.color,
    ...getSubtitleOutlineStyle(subtitleStyling.stroke),
  }}/>
};
export const Subtitle = (
    {
      caption,
      extraClass = "",
      subtitleStyling,
      extraContainerStyle = {}
    }: {
      caption: any[],
      extraClass?: string,
      subtitleStyling: CJKStyling,
      extraContainerStyle?: React.CSSProperties
    }) => {
  const currentContainerStyle = useSubtitleContainerStyle(subtitleStyling, extraContainerStyle);

  return <div
      className={"unselectable fixed z-10 text-center transition-[left,right] duration-300 ease-out " + extraClass}
      style={currentContainerStyle}>
    {caption.length > 0 &&
        <div className={"subtitle-stroke-shadow w-fit z-10 mx-auto rounded-lg px-3 pt-2 pb-1"} style={{
          backgroundColor: subtitleStyling.background,
          fontSize: subtitleStyling.text.fontSize, // Add this line to set the font size
        }}>
          {caption}
        </div>
    }
  </div>
}