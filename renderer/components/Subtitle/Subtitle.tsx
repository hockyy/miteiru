import React, {useEffect, useMemo, useRef, useState} from "react";
import {getLineByTime, SubtitleContainer} from "./DataStructures";
import {ChineseSentence, JapaneseSentence, PlainSentence} from "./Sentence";
import {CJKStyling, defaultSecondarySubtitleStyling} from "../../utils/CJKStyling";
import {adjustTimeWithShift} from "../../utils/utils";
import useSubtitleContainerStyle from "../../hooks/useSubtitleContainerStyle";
import {getSubtitleTokenPresentation} from "./subtitleLanguageSupport";

interface CurrentSubtitleLine {
  content: any[] | string;
  meaning: any[];
}

const emptySubtitleLine: CurrentSubtitleLine = {
  content: '',
  meaning: []
};

const isTimeInCache = (timeCache: number[] | undefined, currentAdjustedTime: number) => (
  timeCache
  && timeCache.length === 2
  && timeCache[0] <= currentAdjustedTime
  && currentAdjustedTime <= timeCache[1]
);

const useCurrentSubtitleLine = ({
  currentTime,
  subtitle,
  shift,
  timeCache,
  setTimeCache,
  logErrors = false
}: {
  currentTime: number,
  subtitle: SubtitleContainer,
  shift: number,
  timeCache?: number[],
  setTimeCache?: (cache: number[]) => void,
  logErrors?: boolean
}) => {
  const [line, setLine] = useState(emptySubtitleLine);
  const cachedSubtitleRef = useRef<SubtitleContainer | null>(null);
  const currentAdjustedTime = useMemo(() => adjustTimeWithShift(currentTime, shift), [currentTime, shift]);

  useEffect(() => {
    const updateTimeCache = (nextCache: number[]) => {
      if (!setTimeCache) return;
      const hasSameCache = timeCache
        && timeCache.length === nextCache.length
        && timeCache.every((cachedTime, index) => cachedTime === nextCache[index]);
      if (!hasSameCache) setTimeCache(nextCache);
    };

    if (cachedSubtitleRef.current === subtitle && isTimeInCache(timeCache, currentAdjustedTime)) {
      return;
    }

    try {
      const nextLine = getLineByTime(subtitle, currentAdjustedTime);
      cachedSubtitleRef.current = subtitle;
      setLine({
        content: nextLine.content,
        meaning: nextLine.meaning
      });
      updateTimeCache(nextLine.timePair ?? []);
    } catch (error) {
      if (logErrors) console.error(error);
      setLine(emptySubtitleLine);
      updateTimeCache([]);
    }
  }, [currentAdjustedTime, logErrors, setTimeCache, subtitle, timeCache]);

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

    let rubyCopyContent = '';
    const caption = content.map((val, index) => {
      const validBasicForm = val.basicForm != '' && val.basicForm != '*';
      const presentation = getSubtitleTokenPresentation(val);

      // Generate ruby HTML for copying
      const rubyHtml = val.separation.map(part => {
        const reading = presentation.getRubyReading(part);
        return `<ruby>${part.main}<rt>${reading || ''}</rt></ruby>`;
      }).join('');
      rubyCopyContent += rubyHtml;

      if (index + 1 < content.length && subtitleStyling?.showSpace) {
        rubyCopyContent += ' ';
      }

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
                                  currentTime: number,
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
  const line = useCurrentSubtitleLine({currentTime, subtitle, shift, timeCache, setTimeCache});
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
                                    currentTime,
                                    subtitle,
                                    shift,
                                    subtitleStyling = defaultSecondarySubtitleStyling,
                                    timeCache,
                                    setTimeCache
                                  }: {
                                    currentTime: number,
                                    subtitle: SubtitleContainer,
                                    shift: number,
                                    subtitleStyling?: CJKStyling,
                                    timeCache?: number[],
                                    setTimeCache?: (cache: number[]) => void;
                                  }
) => {
  const line = useCurrentSubtitleLine({
    currentTime,
    subtitle,
    shift,
    timeCache,
    setTimeCache,
    logErrors: true
  });
  const caption = useMemo(() => {
    const content = line.content;
    if (content === '' || content.length === 0) {
      return [];
    }

    return [<PlainSentence key="secondary" origin={content}/>];
  }, [line.content]);

  return <Subtitle caption={caption} subtitleStyling={subtitleStyling} extraContainerStyle={{
    WebkitTextFillColor: subtitleStyling.text.color,
    WebkitTextStrokeColor: subtitleStyling.stroke.color,
    WebkitTextStrokeWidth: subtitleStyling.stroke.width,
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

  currentContainerStyle[subtitleStyling.positionFromTop ? 'top' : 'bottom'] = subtitleStyling.position;
  return <div
      className={"unselectable fixed w-[100vw] z-10 text-center " + extraClass}
      style={currentContainerStyle}>
    {caption.length > 0 &&
        <div className={"w-fit z-10 mx-auto rounded-lg px-3 pt-2 pb-1"} style={{
          backgroundColor: subtitleStyling.background,
          fontSize: subtitleStyling.text.fontSize, // Add this line to set the font size
        }}>
          {caption}
        </div>
    }
  </div>
}