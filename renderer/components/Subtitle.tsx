import React, {useEffect, useState} from "react";

import parse from 'html-react-parser';
import Sentence from "./Sentence";
import {getLineByTime} from "./dataStructures";

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
      console.log("OK")
      setFromContent(subtitle.lines[0].content)
    } catch (e) {
    }
  }, [subtitle]);
  useEffect(() => {
    console.log(currentTime)
    try {
      const currentContent = getLineByTime(subtitle, Math.trunc(currentTime * 1000));
      console.log(currentContent);
      setFromContent(currentContent);
    } catch (e) {

    }
  }, [currentTime])
  return <div style={{
    WebkitTextStrokeColor: "black",
    WebkitTextStrokeWidth: "1px",
    fontSize: "50px",
    fontFamily: "Arial",
    fontWeight: "bold",
  }}>
    {caption}
  </div>
}

export default Subtitle