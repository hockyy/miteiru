import React, {useEffect, useState} from "react";
import {getLineByTime} from "./DataStructures";
import parse from "html-react-parser"
import {isMixedJapanese} from "shunou";
import {PlainSentence, Sentence} from "./Sentence";


export const PrimarySubtitle = ({currentTime, subtitle, shift, setMeaning}) => {
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
                       extraClass={"subtitle"}/>
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
  }, [currentTime])
  return <Subtitle caption={caption} extraClass={"mb-3 unselectable"}/>
};

export const SecondarySubtitle = ({currentTime, subtitle, shift}) => {
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
  }, [currentTime])
  return <Subtitle caption={caption} extraClass={"fixed top-2"}/>
};

export const Subtitle = ({caption, extraClass}: { caption: any[], extraClass: string }) => {
  return <div
      className={"w-[100vw] justify-center text-center content-center unselectable " + extraClass}
      style={{
        zIndex: 10,
        WebkitTextStrokeColor: "black",
        WebkitTextStrokeWidth: "1px",
        fontSize: "40px",
        fontFamily: "Arial",
        fontWeight: "bold",
      }}>
    {caption.length > 0 &&
        <div className={"bg-black/30 w-fit mx-auto rounded-lg px-3 pt-2 pb-1"}>
          {caption}
        </div>
    }
  </div>
}