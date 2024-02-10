import React, {useCallback, useEffect, useState} from "react";
import {getLineByTime, SubtitleContainer} from "./DataStructures";
import {ChineseSentence, PlainSentence, JapaneseSentence} from "./Sentence";
import {
  CJKStyling,
  defaultPrimarySubtitleStyling,
  defaultSecondarySubtitleStyling
} from "../../utils/CJKStyling";
import {adjustTimeWithShift} from "../../utils/utils";


export const PrimarySubtitle = ({
                                  currentTime,
                                  subtitle,
                                  shift,
                                  setMeaning,
                                  subtitleStyling = defaultPrimarySubtitleStyling,
                                  changeLearningState,
                                  checkLearningState,
                                  timeCache,
                                  setTimeCache
                                }: {
                                  currentTime: number,
                                  subtitle: SubtitleContainer,
                                  shift: number,
                                  setMeaning: any,
                                  subtitleStyling?: CJKStyling,
                                  changeLearningState?: any,
                                  checkLearningState?: any,
                                  timeCache?: any
                                  setTimeCache?: any,
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
          origin={""}
          separation={[{main: content}]}
          setMeaning={() => {
          }}
          extraClass={"subtitle"}
          subtitleStyling={subtitleStyling}
          wordMeaning={''}/>]);
      return;
    }
    let current = content.map((val, index) => {
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
          checkLearningState={checkLearningState}
          changeLearningState={changeLearningState}/> : <JapaneseSentence
          key={index}
          origin={val.origin}
          separation={val.separation}
          setMeaning={setMeaning}
          extraClass={"subtitle"}
          subtitleStyling={subtitleStyling}
          basicForm={validBasicForm ? val.basicForm : ''}
          wordMeaning={wordMeaning[index]}
          checkLearningState={checkLearningState}
          changeLearningState={changeLearningState}/>}{
        index + 1 < content.length
        && subtitleStyling.showSpace ? " " : " "
      }</>
    })
    setCaption(current)
  }, [subtitleStyling, subtitle, checkLearningState, changeLearningState, setMeaning])
  useEffect(() => {
    try {
      const currentAdjustedTime = adjustTimeWithShift(currentTime, shift);
      if (timeCache && timeCache.length == 2
          && timeCache[0] <= currentAdjustedTime
          && currentAdjustedTime <= timeCache[1]) {
        return;
      }
      const line = getLineByTime(subtitle, currentAdjustedTime);
      const primaryContent = line.content;
      setTimeCache(line.timePair);
      setFromContent(primaryContent, line.meaning);
    } catch (e) {
      console.error(e)
    }
  }, [currentTime, subtitle, shift, timeCache])

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
                                    timeCache?: any,
                                    setTimeCache?: any,
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
  }, [currentTime, subtitle, shift, timeCache]);
  useEffect(() => {
    setTimeCache([]);
  }, [subtitle])
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
  let currentContainerStyle: React.CSSProperties = {
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