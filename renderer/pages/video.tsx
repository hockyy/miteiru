import React, {useCallback, useEffect, useRef, useState} from "react";
import VideoJS from "../components/VideoJS";
import {SubtitleContainer} from "../components/DataStructures";
import MiteiruDropzone from "../components/MiteiruDropzone";
import Subtitle from "../components/Subtitle";
import MeaningBox from "../components/MeaningBox";
import Link from "next/link";
import {useRouter} from "next/router";
import {ipcRenderer} from "electron";


function Video() {
  const [videoSrc, setVideoSrc] = useState({src: '', type: ''})
  const [currentTime, setCurrentTime] = useState(0);
  const [meaning, setMeaning] = useState('');
  const [mecab, setMecab] = useState('')
  const [primarySub, setPrimarySub] = useState(new SubtitleContainer('', mecab))
  const [secondarySub, setSecondarySub] = useState(new SubtitleContainer('', mecab))
  const playerRef = useRef(null);
  const readyCallback = useCallback((player) => {
    playerRef.current = player;
  }, [])
  const [dragDrop, setDragDrop] = useState(true);

  const router = useRouter()
  useEffect(() => {
    ipcRenderer.invoke('getMecabCommand').then(val => {
      setMecab(val)
    })
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
          <MeaningBox meaning={meaning} setMeaning={setMeaning} mecab={mecab}/>
          <VideoJS options={{
            autoplay: true,
            controls: true,
            responsive: true,
            sources: [videoSrc],
            playbackRates: [0.5, 1, 1.5, 2],
            controlBar: {
              liveDisplay: false,
              pictureInPictureToggle: false,
              remainingTimeDisplay: true,
              playbackRateMenuButton: false,
              durationDisplay: true
            }
          }} onReady={readyCallback} setCurrentTime={setCurrentTime}/>
          <Subtitle setMeaning={setMeaning} currentTime={currentTime} primarySub={primarySub}
                    secondarySub={secondarySub}/>
        </div>
        {mecab !== '' && dragDrop &&
            <MiteiruDropzone setPrimarySub={setPrimarySub} setSecondarySub={setSecondarySub}
                             setVideoSrc={setVideoSrc} mecab={mecab}/>}

      </React.Fragment>
  );
}

export default Video