import React, {useEffect, useState} from "react";

import parse from 'html-react-parser';
import {getLineByTime} from "./dataStructures";

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

export const Subtitle = ({currentTime, subtitle}) => {
  const [caption, setCaption] = useState([])
  const setFromContent = (content) => {
    if (content === '') setCaption([])
    let current = content.map((val, index) => {
      return <Sentence key={index} origin={val.origin} separation={val.separation}/>
    })
    setCaption(current)
  }
  useEffect(() => {
    try {
      setFromContent(subtitle.lines[0].content)
    } catch (e) {
    }
  }, [subtitle]);
  useEffect(() => {
    console.log(currentTime)
    console.log(subtitle)
    try {
      const currentContent = getLineByTime(subtitle, Math.trunc(currentTime * 1000));
      setFromContent(currentContent);
    } catch (e) {

    }
  }, [currentTime])
  return <div className={"w-[100vw] justify-center text-center content-center"} style={{
    position: "fixed",
    top: "80vh",
    zIndex: 100,
    WebkitTextStrokeColor: "black",
    WebkitTextStrokeWidth: "1px",
    fontSize: "40px",
    fontFamily: "Arial",
    fontWeight: "bold",
  }}>
    {caption.length > 0 && <div className={"bg-white/100 w-fit mx-auto rounded-lg px-3 pt-2 pb-1"}>
      {caption}
    </div>}
  </div>
}

export default Subtitle