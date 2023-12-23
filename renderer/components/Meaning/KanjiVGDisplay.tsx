import React, {useEffect, useState, useRef} from 'react';
import {ipcRenderer} from 'electron';
import {AwesomeButton} from "react-awesome-button";

const KanjiVGDisplay = ({filename}) => {
  const [svgData, setSvgData] = useState("");
  const [animationKey, setAnimationKey] = useState(0);
  const svgRef = useRef(null);
  const timeoutIds = useRef([]);

  useEffect(() => {
    if (filename) {
      ipcRenderer.invoke("readKanjiSVG", filename).then(val => {
        setSvgData(val);
      });
    }
  }, [filename]);

  useEffect(() => {
    if (svgData) {
      // Before setting up new animations, clear all previous ones
      timeoutIds.current.forEach(id => clearTimeout(id));
      timeoutIds.current = [];
      const svgContainer = svgRef.current;

      // Assuming that svgContainer now refers to the parent g element
      const elementContainer = (svgContainer.children[0].children[0].children[0]);

      const groups: SVGPathElement[] = elementContainer.getAttribute('kvg:radical') ? [elementContainer] : Array.from(elementContainer.children);
      const texts = svgContainer.querySelectorAll('text');
      let strokeIndex = 0;
      const draw = (path, index, color) => {
        const length = path.getTotalLength();
        path.style.transition = "none";
        path.style.strokeDasharray = length + ' ' + length;
        path.style.strokeDashoffset = String(length);
        path.style.strokeWidth = '5';
        path.style.stroke = color;
        path.getBoundingClientRect();
        path.style.transition = "stroke-dashoffset 1s ease-in-out";
        const timeoutId = setTimeout(() => {
          path.style.strokeDashoffset = "0";
        }, strokeIndex * 1000);

        // Store the timeout ID so you can clear it later if needed
        timeoutIds.current.push(timeoutId);
        strokeIndex++;
      }
      groups.forEach(group => {
        const color = getRandomColor();
        let paths: SVGPathElement[] = Array.from(group.querySelectorAll('path[id^="kvg"]'));
        if (paths.length === 0) {
          paths = [group];
        }
        paths.forEach((path, index) => {
          draw(path, index, color)
        });
      });

      texts.forEach((text, index) => {
        text.style.transition = "none";
        text.style.opacity = "0";
        text.getBoundingClientRect();
        text.style.transition = "opacity 1s ease-in-out";
        const timeoutId = setTimeout(() => {
          text.style.opacity = "1";
        }, index * 1000);

        // Store the timeout ID so you can clear it later if needed
        timeoutIds.current.push(timeoutId);
      });
    }
  }, [svgData, animationKey]);

  useEffect(() => {
    if (svgData) {
      const svgContainer = svgRef.current;

      const svgElement = svgContainer.children[0]
      const width = svgElement.getAttribute('width');
      const height = svgElement.getAttribute('height');
      const scaleFactor = 1.5;  // Replace with your scale factor

      if (width && height) {
        svgElement.setAttribute('width', parseInt(width) * scaleFactor);
        svgElement.setAttribute('height', parseInt(height) * scaleFactor);
      }
    }
  }, [svgData])

  const handleButtonClick = () => {
    setAnimationKey(prevKey => prevKey + 1);
  }

  const getRandomColor = () => {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  }

  return (
    <div className={'flex flex-col w-auto p-4 gap-4 items-center'}>
      <AwesomeButton type={'primary'} onPress={handleButtonClick}>Repeat Animation</AwesomeButton>
      <div className="svg-container" ref={svgRef} dangerouslySetInnerHTML={{__html: svgData}}/>
    </div>
  );
};

export default KanjiVGDisplay;
