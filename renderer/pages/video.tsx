import React, {useCallback, useEffect, useRef, useState} from "react";
import {useDropzone} from "react-dropzone";
import VideoJS from "../components/VideoJS";
import {SubtitleContainer} from "../components/dataStructures";
import MiteiruDropzone from "../components/MiteiruDropzone";
import Subtitle from "../components/Subtitle";


function Video() {
  const [videoSrc, setVideoSrc] = useState({src: '', type: ''})
  const [currentSubtitle, setCurrentSubtitle] = useState(new SubtitleContainer(''))
  const [currentTime, setCurrentTime] = useState(0);
  const playerRef = useRef(null);
  const readyCallback = useCallback((player) => {
    playerRef.current = player;
  }, [])
  const [dragDrop, setDragDrop] = useState(true);
  useEffect(() => {
    const handleKeyPress = (event) => {
      if(event.key === "x")
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
        <div onClick={() => {
          console.log("OK")
        }
        }>
          <VideoJS options={{
            autoplay: true,
            controls: true,
            responsive: true,
            sources: [videoSrc]
          }} onReady={readyCallback} setCurrentTime={setCurrentTime}/>
          <Subtitle currentTime={currentTime} subtitle={currentSubtitle}/>
        </div>
        {dragDrop && <MiteiruDropzone setCurrentSubtitle={setCurrentSubtitle} setVideoSrc={setVideoSrc}/>}

      </React.Fragment>
  );
}

export default Video