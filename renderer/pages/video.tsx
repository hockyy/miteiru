import React, {useCallback, useEffect, useState} from "react";
import VideoJS from "../components/VideoJS";
import {SubtitleContainer} from "../components/DataStructures";
import MiteiruDropzone from "../components/MiteiruDropzone";
import {PrimarySubtitle, SecondarySubtitle} from "../components/Subtitle";
import MeaningBox from "../components/MeaningBox";
import {useRouter} from "next/router";
import {ipcRenderer} from "electron";
import {VideoController} from "../components/VideoController";
import Toast, {TOAST_TIMEOUT} from "../components/Toast";
import {Sidebar} from "../components/Sidebar";
import {defaultPrimarySubtitleStyling, defaultSecondarySubtitleStyling} from "../utils/CJKStyling";
import {randomUUID} from "crypto";

function Video() {
  const [videoSrc, setVideoSrc] = useState({src: '', type: ''})
  const [currentTime, setCurrentTime] = useState(0);
  const [meaning, setMeaning] = useState('');
  const [mecab, setMecab] = useState('')

  const [primarySub, setPrimarySub] = useState(new SubtitleContainer('', mecab))
  const [primaryShift, setPrimaryShift] = useState(0)
  const [primaryStyling, setPrimaryStyling] = useState(defaultPrimarySubtitleStyling);

  const [secondarySub, setSecondarySub] = useState(new SubtitleContainer('', mecab))
  const [secondaryShift, setSecondaryShift] = useState(0)
  const [secondaryStyling, setSecondaryStyling] = useState(defaultSecondarySubtitleStyling);

  const [player, setPlayer] = useState(null)
  const [metadata, setMetadata] = useState(0)
  const [showController, setShowController] = useState(true);
  const [toastInfo, setToastInfo] = useState({message: 'coba', update: ''});
  const [showSidebar, setShowSidebar] = useState(false)

  const onLoadFiles = useCallback(async acceptedFiles => {
    let currentPath = acceptedFiles[0].path;
    currentPath = currentPath.replaceAll('\\', '/')
    let pathUri = currentPath
    if (process.platform === 'win32') {
      pathUri = '/' + currentPath
    }
    if (currentPath.endsWith('.srt') || currentPath.endsWith('.vtt') || currentPath.endsWith('.ass')) {
      setToastInfo({
        message: 'Loading subtitle, please wait!',
        update: randomUUID()
      });
      const toastSetter = setInterval(() => {
        console.log("WTF");
        setToastInfo({
          message: 'Still loading subtitle, please wait!',
          update: randomUUID()
        })
      }, TOAST_TIMEOUT);
      const draggedSubtitle = {
        type: 'text/plain',
        src: `${currentPath}`
      }
      console.log(toastSetter)
      const tmpSub = await SubtitleContainer.create(draggedSubtitle.src, mecab);
      clearInterval(toastSetter);
      console.log("OK")
      if (tmpSub.language === "JP") {
        setPrimarySub(tmpSub)
      } else {
        setSecondarySub(tmpSub)
      }
      setToastInfo({
        message: 'Subtitle loaded',
        update: randomUUID()
      })
    } else if (currentPath.endsWith('.mp4') || currentPath.endsWith('.mkv')) {
      const draggedVideo = {
        type: 'video/webm',
        src: `miteiru://${pathUri}`
      }
      setVideoSrc(draggedVideo)
    }
  }, [])

  const readyCallback = useCallback((playerRef) => {
    setPlayer(playerRef);
    playerRef.on('loadedmetadata', () => {
      setMetadata(old => (old + 1))
    })
  }, [])
  const [dragDrop, setDragDrop] = useState(true);
  const resetSub = (subSetter) => {
    subSetter(new SubtitleContainer('', mecab))
  }

  useEffect(() => {
    resetSub(setPrimarySub)
    resetSub(setSecondarySub)
  }, [videoSrc])

  const router = useRouter()
  useEffect(() => {
    ipcRenderer.invoke('getMecabCommand').then(val => {
      setMecab(val)
    })
    // https://www.freecodecamp.org/news/javascript-keycode-list-keypress-event-key-codes/
    const handleKeyPress = (event) => {
      event.preventDefault()
      event.stopPropagation()
      if (event.code === "Escape") {
        setMeaning("")
      } else if (event.code === "KeyQ") {
        router.push('/home')
      } else if (event.code === "KeyL") {
        router.push('/learn')
      } else if (event.code === "KeyZ") {
        setShowController((old) => {
          return !old
        })
      } else if (event.code === "KeyX") {
        setShowSidebar((old) => {
          return !old
        })
      } else if (event.code === "KeyO") {
        resetSub(setPrimarySub)
      } else if (event.code === "KeyP") {
        resetSub(setSecondarySub)
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
          <Toast info={toastInfo}/>
          <MeaningBox meaning={meaning} setMeaning={setMeaning} mecab={mecab}/>
          <VideoJS options={{
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
          <div>
            <PrimarySubtitle setMeaning={setMeaning}
                             currentTime={currentTime}
                             subtitle={primarySub}
                             shift={primaryShift}
                             subtitleStyling={primaryStyling}/>
            <SecondarySubtitle
                currentTime={currentTime}
                subtitle={secondarySub}
                shift={secondaryShift}
                subtitleStyling={secondaryStyling}/>
          </div>
          <div className={"flex flex-col justify-end bottom-0 z-[15] fixed"}>
            {player && <VideoController player={player}
                                        currentTime={currentTime}
                                        setCurrentTime={setCurrentTime}
                                        metadata={metadata}
                                        showController={showController}
                                        setPrimaryShift={setPrimaryShift}
                                        setSecondaryShift={setSecondaryShift}
                                        setInfo={setToastInfo}
                                        setShowSidebar={setShowSidebar}/>}
          </div>
          {mecab !== '' && <MiteiruDropzone onDrop={onLoadFiles}/>}


        </div>
        <Sidebar showSidebar={showSidebar} setShowSidebar={setShowSidebar}
                 primaryStyling={primaryStyling}
                 setPrimaryStyling={setPrimaryStyling}
                 secondaryStyling={secondaryStyling}
                 setSecondaryStyling={setSecondaryStyling}/>
      </React.Fragment>
  );
}

export default Video