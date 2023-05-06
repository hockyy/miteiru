import React, {useEffect, useState} from "react";
import {getLineByTime, SubtitleContainer} from "./DataStructures";
import {PlainSentence, Sentence} from "./Sentence";
import {
  CJKStyling,
  defaultPrimarySubtitleStyling,
  defaultSecondarySubtitleStyling
} from "../utils/CJKStyling";


export const PrimarySubtitle = ({
                                  currentTime,
                                  subtitle,
                                  shift,
                                  setMeaning,
                                  subtitleStyling = defaultPrimarySubtitleStyling
                                }: {
                                  currentTime: number,
                                  subtitle: SubtitleContainer,
                                  shift: number,
                                  setMeaning: any,
                                  subtitleStyling?: CJKStyling
                                }
) => {
  const [caption, setCaption] = useState([])
  const setFromContent = (content) => {
    if (content === '' || content.length === 0) {
      setCaption([])
      return;
    }
    let current = content.map((val, index) => {
      return <Sentence key={index}
                       origin={val.origin}
                       separation={val.separation}
                       setMeaning={setMeaning}
                       extraClass={"subtitle"}
                       subtitleStyling={subtitleStyling}/>
    })
    setCaption(current)
  }
  useEffect(() => {
    try {
      const primaryContent = getLineByTime(subtitle, shift, Math.trunc(currentTime * 1000));
      setFromContent(primaryContent);
    } catch (e) {
      console.log(e)
    }
  }, [currentTime, subtitleStyling])
  return <Subtitle caption={caption} subtitleStyling={subtitleStyling}/>
};

export const SecondarySubtitle = ({
                                    currentTime,
                                    subtitle,
                                    shift,
                                    subtitleStyling = defaultSecondarySubtitleStyling
                                  }: {
                                    currentTime: number,
                                    subtitle: SubtitleContainer,
                                    shift: number,
                                    subtitleStyling?: CJKStyling
                                  }
) => {
  const [caption, setCaption] = useState([])
  const setFromContent = (content) => {
    if (content === '' || content.length === 0) {
      setCaption([])
      return;
    }
    const current = <PlainSentence origin={content}/>
    setCaption([current])
  }
  useEffect(() => {
    try {
      const secondaryContent = getLineByTime(subtitle, shift, Math.trunc(currentTime * 1000));
      setFromContent(secondaryContent);
    } catch (e) {
      console.log(e)
    }
  }, [currentTime, subtitleStyling])
  return <Subtitle caption={caption} extraClass={"fixed top-2"} subtitleStyling={subtitleStyling}/>
};
export const Subtitle = ({
                           caption,
                           extraClass = "",
                           subtitleStyling
                         }: { caption: any[], extraClass?: string, subtitleStyling: CJKStyling }) => {

  return <div
      className={"fixed w-[100vw] z-10 font-bold unselectable text-center " + extraClass}
      style={{
        WebkitTextFillColor: subtitleStyling.text.color,
        WebkitTextStrokeColor: subtitleStyling.stroke.color,
        WebkitTextStrokeWidth: subtitleStyling.stroke.width,
        fontFamily: "Arial",
        top: subtitleStyling.positionFromTop, // Add this line to set the position from top
      }}>
    {caption.length > 0 &&
        <div className={"w-fit mx-auto rounded-lg px-3 pt-2 pb-1"} style={{
          backgroundColor: subtitleStyling.background,
          fontSize: subtitleStyling.text.fontSize, // Add this line to set the font size
        }}>
          {caption}
        </div>
    }
  </div>
}