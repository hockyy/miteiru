import React from "react";
import VideoJS from "../components/VideoJS";
import MiteiruDropzone from "../components/MiteiruDropzone";
import {PrimarySubtitle, SecondarySubtitle} from "../components/Subtitle";
import MeaningBox from "../components/MeaningBox";
import {VideoController} from "../components/VideoController";
import Toast from "../components/Toast";
import {Sidebar} from "../components/Sidebar";
import useKeyBind from "../hooks/useKeyBind";
import useSubtitle from "../hooks/useSubtitle";
import useLoadFiles from "../hooks/useLoadFiles";
import useMenuDisplay from "../hooks/useMenuDisplay";
import useReadyPlayerCallback from "../hooks/useReadyPlayerCallback";
import useMiteiruToast from "../hooks/useMiteiruToast";
import useMeaning from "../hooks/useMeaning";
import Head from "next/head";
import {getMiteiruVideoTitle} from "../utils/utils";
import {
  useVideoKeyboardControls,
  useVideoPlayingToggle,
  useVideoTimeChanger
} from "../hooks/useVideoController";
import {usePlayNextAfterEnd} from "../hooks/usePlayNextAfterEnd";
import useMiteiruTokenizer from "../hooks/useMiteiruTokenizer";
import 'react-awesome-button/dist/styles.css';

function Video() {
  const {tokenizerMode, tokenizeMiteiru} = useMiteiruTokenizer();
  const {toastInfo, setToastInfo} = useMiteiruToast();
  const {
    readyCallback,
    metadata,
    player,
    currentTime,
    setCurrentTime
  } = useReadyPlayerCallback();
  const {
    primarySub,
    setPrimarySub,
    secondarySub,
    setSecondarySub,
    primaryShift,
    setPrimaryShift,
    secondaryShift,
    setSecondaryShift,
    primaryStyling,
    setPrimaryStyling,
    secondaryStyling,
    setSecondaryStyling
  } = useSubtitle();
  const {meaning, setMeaning} = useMeaning();
  const {
    duration,
    deltaTime,
    changeTimeTo,
    enableSeeker,
    setEnableSeeker
  } = useVideoTimeChanger(player, setCurrentTime, metadata);
  const {videoSrc, onLoadFiles, onVideoChangeHandler} =
      useLoadFiles(setToastInfo,
          primarySub, setPrimarySub,
          secondarySub, setSecondarySub,
          primaryStyling,
          tokenizeMiteiru, setEnableSeeker, changeTimeTo, player);
  const {showController, setShowController, showSidebar, setShowSidebar} = useMenuDisplay();
  useKeyBind(setMeaning, setShowController, setShowSidebar, setPrimarySub, setSecondarySub, primarySub);
  const {togglePlay, isPlaying} = useVideoPlayingToggle(player, metadata);
  useVideoKeyboardControls(togglePlay, deltaTime, setPrimaryShift, setSecondaryShift, setToastInfo);
  usePlayNextAfterEnd(player, currentTime, onVideoChangeHandler, duration, setEnableSeeker)
  return (
      <React.Fragment>
        <Head>
          <title>{getMiteiruVideoTitle(videoSrc.path, primarySub.path, secondarySub.path)}</title>
        </Head>
        <div>
          <Toast info={toastInfo}/>
          <MeaningBox meaning={meaning} setMeaning={setMeaning} tokenizeMiteiru={tokenizeMiteiru}/>
          <VideoJS options={{
            techOrder: ["html5", "youtube"],
            sources: [videoSrc],
            youtube: {
              customVars: {
                cc_load_policy: 0,
                autoplay: 1,
                loop: 0,
                disablekb: 1,
                controls: 0,
                playsinline: 1,
                rel: 0,
                modestbranding: 1
              }
            },
            responsive: true,
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
            {player && <VideoController
                isPlaying={isPlaying}
                duration={duration}
                changeTimeTo={changeTimeTo}
                deltaTime={deltaTime}
                togglePlay={togglePlay}
                player={player}
                currentTime={currentTime}
                showController={showController}
                setShowSidebar={setShowSidebar}
                enableSeeker={enableSeeker}
                setEnableSeeker={setEnableSeeker}
                onVideoChangeHandler={onVideoChangeHandler}/>}
          </div>
          {tokenizerMode !== '' && <MiteiruDropzone onDrop={onLoadFiles}/>}
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