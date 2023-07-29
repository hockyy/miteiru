import React, {useEffect, useState, useRef} from 'react';
import {ipcRenderer} from 'electron';

const KanjiVGDisplay = ({filename}) => {
  const [svgData, setSvgData] = useState("");
  const [animationKey, setAnimationKey] = useState(0);
  const svgRef = useRef(null);

  useEffect(() => {
    if (filename) {
      ipcRenderer.invoke("readKanjiSVG", filename).then(val => {
        const cleanSvgData = val.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i)[0];
        console.log(cleanSvgData)
        setSvgData(cleanSvgData);
      });
    }
  }, [filename]);

  useEffect(() => {
    if (svgData) {
      const svgContainer = svgRef.current;
      // Assuming that svgContainer now refers to the parent g element
      const elementContainer = (svgContainer.children[0].children[0].children[0]);
      console.log(elementContainer.children)
      // const groups = elementContainer

      const groups: Element[] = Array.from(elementContainer.children);
      // console.log(groups)
      const texts = svgContainer.querySelectorAll('text');
      let strokeIndex = 0;

      groups.forEach(group => {
        console.log(group)
        const color = getRandomColor();
        const paths = group.querySelectorAll('path[id^="kvg"]');

        paths.forEach((path, index) => {
          const length = path.getTotalLength();
          path.style.transition = "none";
          path.style.strokeDasharray = length + ' ' + length;
          path.style.strokeDashoffset = length;
          path.style.strokeWidth = '5';
          path.style.stroke = color;
          path.getBoundingClientRect();
          path.style.transition = "stroke-dashoffset 2s ease-in-out";
          setTimeout(() => {
            path.style.strokeDashoffset = "0";
          }, strokeIndex * 2000);
          strokeIndex++;
        });
      });

      texts.forEach((text, index) => {
        text.style.transition = "none";
        text.style.opacity = "0";
        text.getBoundingClientRect();
        text.style.transition = "opacity 2s ease-in-out";
        setTimeout(() => {
          text.style.opacity = "1";
        }, index * 2000);
      });
    }
  }, [svgData, animationKey]);

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
      <div>
        <button onClick={handleButtonClick}>Repeat Animation</button>
        <div ref={svgRef} dangerouslySetInnerHTML={{__html: svgData}}/>
      </div>
  );
};

export default KanjiVGDisplay;
