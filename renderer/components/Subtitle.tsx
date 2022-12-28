import React, {useEffect, useState} from "react";
import {getLineByTime} from "./DataStructures";
import parse from "html-react-parser"

const Sentence = ({origin, separation}) => {
  const handleChange = (origin) => {
    console.log(origin)
  }
  return <button className={"subtitle"} onClick={() => {
    handleChange(origin)
  }}>
    {separation.map((val, index) => {
      return <ruby key={index}>{val.bottom}
        <rp>(</rp>
        <rt>{val.top ?? ''}</rt>
        <rp>)</rp>
      </ruby>
    })}
  </button>
}


const PlainSentence = ({origin}) => {
  return <div>{parse(origin)}</div>
}

export const Subtitle = ({currentTime, primarySub, secondarySub}) => {
  const [caption, setCaption] = useState([])
  const [secondaryCaption, setSecondaryCaption] = useState([])
  const setFromContent = (content) => {
    if (content === '' || content.length === 0) {
      setCaption([])
      return;
    }
    let current = content.map((val, index) => {
      return <Sentence key={index} origin={val.origin} separation={val.separation}/>
    })
    setCaption(current)
  }
  const setFromSecondaryContent = (content) => {
    if (content === '' || content.length === 0) {
      setSecondaryCaption('')
      return;
    }
    const current = <PlainSentence origin={content}/>
    setSecondaryCaption([current])
  }
  useEffect(() => {
    try {
      const primaryContent = getLineByTime(primarySub, Math.trunc(currentTime * 1000));
      setFromContent(primaryContent);
      const secondaryContent = getLineByTime(secondarySub, Math.trunc(currentTime * 1000));
      setFromSecondaryContent(secondaryContent);
    } catch (e) {
      console.log(e)
    }
  }, [currentTime])
  return <div>
    <div className={"w-[100vw] justify-center text-center content-center"} style={{
      position: "fixed",
      top: "80vh",
      zIndex: 100,
      WebkitTextStrokeColor: "black",
      WebkitTextStrokeWidth: "1px",
      fontSize: "40px",
      fontFamily: "Arial",
      fontWeight: "bold",
    }}>
      {caption.length > 0 &&
          <div className={"bg-white/100 w-fit mx-auto rounded-lg px-3 pt-2 pb-1"}>
            {caption}
          </div>}
    </div>
    <div className={"w-[100vw] justify-center text-center content-center"} style={{
      position: "fixed",
      top: "10vh",
      zIndex: 100,
      WebkitTextStrokeColor: "black",
      WebkitTextStrokeWidth: "1px",
      fontSize: "40px",
      fontFamily: "Arial",
      fontWeight: "bold",
    }}>
      {secondaryCaption.length > 0 &&
          <div className={"bg-white/100 w-fit mx-auto rounded-lg px-3 pt-2 pb-1"}>
            {secondaryCaption}
          </div>}
    </div>
  </div>
}

export default Subtitle