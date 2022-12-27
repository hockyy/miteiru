import React, {useCallback, useRef, useState} from "react";
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
  return (
      <React.Fragment>
        <div>
          <VideoJS options={{
            autoplay: true,
            controls: true,
            responsive: true,
            fluid: true,
            sources: [videoSrc]
          }} onReady={readyCallback} setCurrentTime={setCurrentTime}/>
          <Subtitle currentTime={currentTime} subtitle={currentSubtitle}/>
        </div>
        <MiteiruDropzone setCurrentSubtitle={setCurrentSubtitle} setVideoSrc={setVideoSrc}/>

      </React.Fragment>
  );
}

export default Video