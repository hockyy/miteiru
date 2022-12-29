import React, {useCallback, useEffect, useRef, useState} from "react";
import VideoJS from "../components/VideoJS";
import {SubtitleContainer} from "../components/DataStructures";
import MiteiruDropzone from "../components/MiteiruDropzone";
import Subtitle from "../components/Subtitle";
import MeaningBox from "../components/MeaningBox";
import Link from "next/link";
import {useRouter} from "next/router";


function Video() {
  const [videoSrc, setVideoSrc] = useState({src: '', type: ''})
  const [primarySub, setPrimarySub] = useState(new SubtitleContainer(''))
  const [secondarySub, setSecondarySub] = useState(new SubtitleContainer(''))
  const [currentTime, setCurrentTime] = useState(0);
  const [meaning, setMeaning] = useState('');
  const playerRef = useRef(null);
  const readyCallback = useCallback((player) => {
    playerRef.current = player;
  }, [])
  const [dragDrop, setDragDrop] = useState(true);

  const router = useRouter()
  useEffect(() => {
    const handleKeyPress = (event) => {
      if (event.key === "x") {
        setDragDrop((old) => {
          return !old
        })
      } else if (event.key === "Escape") {
        setMeaning("")
      } else if (event.key === "q") {
        router.push('/home')
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, []);
  return (
      <React.Fragment>
        <div>
          <MeaningBox meaning={meaning} setMeaning={setMeaning}/>
          <VideoJS options={{
            autoplay: true,
            controls: true,
            responsive: true,
            sources: [videoSrc]
          }} onReady={readyCallback} setCurrentTime={setCurrentTime}/>
          <Subtitle setMeaning={setMeaning} currentTime={currentTime} primarySub={primarySub}
                    secondarySub={secondarySub}/>
        </div>
        {dragDrop &&
            <MiteiruDropzone setPrimarySub={setPrimarySub} setSecondarySub={setSecondarySub}
                             setVideoSrc={setVideoSrc}/>}

      </React.Fragment>
  );
}

export default Video