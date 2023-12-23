import React, {useEffect, useRef, useState} from "react";
import {ipcRenderer} from 'electron';

import {AwesomeButton} from "react-awesome-button";

const MakeMeAHanziDisplay = ({filename = '20912.svg'}) => {

  const [svgData, setSvgData] = useState("");
  useEffect(() => {
    if (filename) {
      ipcRenderer.invoke("readHanziSVG", filename).then(val => {
        setSvgData(val);
      });
    }
  }, [filename]);


  useEffect(() => {

    if (svgData) {
      console.log(svgData)
    }
  }, [svgData]);

  const svgRef = useRef(null);
  return <div className={'flex flex-col w-auto p-4 gap-4 items-center'}>
    <AwesomeButton type={'primary'} onPress={() => {
    }}>Repeat Animation</AwesomeButton>
    <div className="svg-container" ref={svgRef} dangerouslySetInnerHTML={{__html: svgData}}/>
  </div>
}

export default MakeMeAHanziDisplay;