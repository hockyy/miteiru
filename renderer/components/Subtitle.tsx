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
    try {
      const currentContent = getLineByTime(subtitle, Math.trunc(currentTime * 1000));
      setFromContent(currentContent);
    } catch (e) {

    }
  }, [currentTime])
  return <div className={"w-[100vw] justify-center text-center"} style={{
    WebkitTextStrokeColor: "black",
    WebkitTextStrokeWidth: "1px",
    fontSize: "30px",
    fontFamily: "Arial",
    fontWeight: "bold",
  }}>
    {caption}
  </div>
}

export default Subtitle