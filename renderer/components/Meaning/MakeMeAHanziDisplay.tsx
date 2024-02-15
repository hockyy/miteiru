import React, {useEffect, useRef, useState} from "react";
import {ipcRenderer} from 'electron';

import {AwesomeButton} from "react-awesome-button";

const MakeMeAHanziDisplay = ({character}) => {

  const [svgData, setSvgData] = useState("");
  useEffect(() => {
    if (character) {
      const filename = character.charCodeAt(0) + '.svg';
      ipcRenderer.invoke("readHanziSVG", filename).then(val => {
        const addSize = val.replace('<svg ', '<svg width=109 height=109 ');
        setSvgData(addSize);
      });
    }
  }, [character]);

  const svgRef = useRef(null);
  return svgData ? <div className={'flex flex-col w-auto p-4 gap-4 items-center'}>
    <AwesomeButton type={'primary'} onPress={() => {
      setSvgData(old => {
        return old + ' ';
      })
    }}>Repeat Animation</AwesomeButton>
    <div className="svg-container" ref={svgRef} dangerouslySetInnerHTML={{__html: svgData}}/>
  </div> : (<></>);
}

export default MakeMeAHanziDisplay;