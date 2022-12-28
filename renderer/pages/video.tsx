import React, {useCallback, useEffect, useRef, useState} from "react";
import {useDropzone} from "react-dropzone";
import VideoJS from "../components/VideoJS";
import {SubtitleContainer} from "../components/DataStructures";
import MiteiruDropzone from "../components/MiteiruDropzone";
import Subtitle from "../components/Subtitle";


function Video() {
  const [videoSrc, setVideoSrc] = useState({src: '', type: ''})
  const [primarySub, setPrimarySub] = useState(new SubtitleContainer(''))
  const [secondarySub, setSecondarySub] = useState(new SubtitleContainer(''))
  const [currentTime, setCurrentTime] = useState(0);
  const playerRef = useRef(null);
  const readyCallback = useCallback((player) => {
    playerRef.current = player;
  }, [])
  const [dragDrop, setDragDrop] = useState(true);
  useEffect(() => {
    const handleKeyPress = (event) => {
      if (event.key === "x")
        setDragDrop((old) => {
          return !old
        })
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, []);
  return (
      <React.Fragment>
        <div>
          <VideoJS options={{
            autoplay: true,
            controls: true,
            responsive: true,
            sources: [videoSrc]
          }} onReady={readyCallback} setCurrentTime={setCurrentTime}/>
          <Subtitle currentTime={currentTime} primarySub={primarySub} secondarySub={secondarySub}/>
        </div>
        {dragDrop &&
            <MiteiruDropzone setPrimarySub={setPrimarySub} setSecondarySub={setSecondarySub}
                             setVideoSrc={setVideoSrc}/>}

      </React.Fragment>
  );
}

export default Video