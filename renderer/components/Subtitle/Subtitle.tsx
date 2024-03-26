import React, {useCallback, useEffect, useState} from "react";
import {getLineByTime, SubtitleContainer} from "./DataStructures";
import {ChineseSentence, JapaneseSentence, PlainSentence} from "./Sentence";
import {CJKStyling, defaultSecondarySubtitleStyling} from "../../utils/CJKStyling";
import {adjustTimeWithShift} from "../../utils/utils";


export const PrimarySubtitle = ({
                                  currentTime,
                                  subtitle,
                                  shift,
                                  setMeaning,
                                  subtitleStyling,
                                  changeLearningState,
                                  getLearningStateClass,
                                  timeCache,
                                  setTimeCache
                                }: {
                                  currentTime: number,
                                  subtitle: SubtitleContainer,
                                  shift: number,
                                  setMeaning: (newMeaning: string) => void,
                                  subtitleStyling?: CJKStyling,
                                  changeLearningState?: (newMeaning: string) => void,
                                  getLearningStateClass?: (newMeaning: string) => string,
                                  timeCache?: number[],
                                  setTimeCache?: (cache: number[]) => void;
                                }
) => {
  const [caption, setCaption] = useState([]);


  const setFromContent = useCallback((content, wordMeaning = []) => {
    if (content === '' || content.length === 0) {
      setCaption([])
      return;
    }
    if (typeof content === 'string') {
      setCaption([<JapaneseSentence
          key={'only'}
          origin={""}
          separation={[{main: content}]}
          setMeaning={() => {
          }}
          extraClass={"subtitle"}
          subtitleStyling={subtitleStyling}
          wordMeaning={''}/>]);
      return;
    }
    const current = content.map((val, index) => {
      const validBasicForm = val.basicForm != '' && val.basicForm != '*';
      return <> {(val.jyutping || val.pinyin) ? <ChineseSentence
          key={index}
          origin={val.origin}
          separation={val.separation}
          setMeaning={setMeaning}
          extraClass={"subtitle"}
          subtitleStyling={subtitleStyling}
          basicForm={validBasicForm ? val.basicForm : ''}
          wordMeaning={wordMeaning[index]}
          getLearningStateClass={getLearningStateClass}
          changeLearningState={changeLearningState}/> : <JapaneseSentence
          key={index}
          origin={val.origin}
          separation={val.separation}
          setMeaning={setMeaning}
          extraClass={"subtitle"}
          subtitleStyling={subtitleStyling}
          basicForm={validBasicForm ? val.basicForm : ''}
          wordMeaning={wordMeaning[index]}
          getLearningStateClass={getLearningStateClass}
          changeLearningState={changeLearningState}/>}{
        index + 1 < content.length
        && subtitleStyling.showSpace ? " " : " "
      }</>
    })
    setCaption(current)
  }, [subtitleStyling, getLearningStateClass, changeLearningState, setMeaning]);

  const setSubtitle = useCallback((currentAdjustedTime) => {
    try {
      const line = getLineByTime(subtitle, currentAdjustedTime);
      const primaryContent = line.content;
      setFromContent(primaryContent, line.meaning);
      setTimeCache(line.timePair);
    } catch (e) {
      console.error(e);
    }
  }, [subtitle, setFromContent, setTimeCache]);

  useEffect(() => {
    const currentAdjustedTime = adjustTimeWithShift(currentTime, shift);
    if (timeCache && timeCache.length == 2
        && timeCache[0] <= currentAdjustedTime
        && currentAdjustedTime <= timeCache[1]) {
      return;
    }
    setSubtitle(currentAdjustedTime);
  }, [setSubtitle, timeCache, currentTime, shift]);

  useEffect(() => {
    const currentAdjustedTime = adjustTimeWithShift(currentTime, shift);
    setSubtitle(currentAdjustedTime);
  }, [setSubtitle, currentTime, shift]);

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
  const [caption, setCaption] = useState([]);
  const setFromContent = useCallback((content) => {
    if (content === '' || content.length === 0) {
      setCaption([])
      return;
    }
    const current = <PlainSentence origin={content}/>
    setCaption([current])
  }, []);

  useEffect(() => {
    const currentAdjustedTime = adjustTimeWithShift(currentTime, shift);
    if (timeCache && timeCache.length == 2
        && timeCache[0] <= currentAdjustedTime
        && currentAdjustedTime <= timeCache[1]) {
      return;
    }
    try {
      const secondaryContent = getLineByTime(subtitle, currentAdjustedTime);
      setTimeCache(secondaryContent.timePair);
      setFromContent(secondaryContent.content);
    } catch (e) {
      console.error(e)
    }
  }, [currentTime, subtitle, shift, timeCache, setTimeCache, setFromContent]);
  useEffect(() => {
    setTimeCache([]);
  }, [setTimeCache, subtitle])
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
  const currentContainerStyle: React.CSSProperties = {
    ...extraContainerStyle,
    fontFamily: "Arial",
    fontWeight: subtitleStyling.text.weight
  }
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