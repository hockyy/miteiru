import React, {useEffect} from "react";
import VideoJS from "../components/VideoPlayer/VideoJS";
import MiteiruDropzone from "../components/VideoPlayer/MiteiruDropzone";
import {PrimarySubtitle, SecondarySubtitle} from "../components/Subtitle/Subtitle";
import MeaningBox from "../components/Meaning/MeaningBox";
import {VideoController} from "../components/VideoPlayer/VideoController";
import Toast from "../components/VideoPlayer/Toast";
import {Sidebar} from "../components/VideoPlayer/Sidebar";
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
import useLearningState from "../hooks/useLearningState";

function Video() {
  const {tokenizerMode, tokenizeMiteiru, lang} = useMiteiruTokenizer();
  const {toastInfo, setToastInfo} = useMiteiruToast();
  const {
    readyCallback,
    metadata,
    player,
    currentTime,
    setCurrentTime
  } = useReadyPlayerCallback();
  const {checkLearningState, changeLearningState} = useLearningState();
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
    setSecondaryStyling,
    showPrimarySub,
    setShowPrimarySub,
    showSecondarySub,
    setShowSecondarySub,
  } = useSubtitle();
  const {meaning, setMeaning, undo} = useMeaning();
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
          tokenizeMiteiru, setEnableSeeker, changeTimeTo, player, lang);
  const {showController, setShowController, showSidebar, setShowSidebar} = useMenuDisplay();
  useKeyBind(setMeaning, setShowController, setShowSidebar,
      setPrimarySub, setSecondarySub, primarySub, undo,
      setShowPrimarySub, setShowSecondarySub);
  const {togglePlay, isPlaying} = useVideoPlayingToggle(player, metadata);
  useVideoKeyboardControls(togglePlay, deltaTime, setPrimaryShift, setSecondaryShift, setToastInfo);
  usePlayNextAfterEnd(player, currentTime, onVideoChangeHandler, duration, setEnableSeeker);

  return (
      <React.Fragment>
        <Head>
          <title>{getMiteiruVideoTitle(videoSrc.path, primarySub.path, secondarySub.path, showPrimarySub, showSecondarySub)}</title>
        </Head>
        <div>
          <Toast info={toastInfo}/>
          <MeaningBox meaning={meaning} setMeaning={setMeaning} tokenizeMiteiru={tokenizeMiteiru}
                      lang={lang}/>
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
            {showPrimarySub && <PrimarySubtitle setMeaning={setMeaning}
                                                currentTime={currentTime}
                                                subtitle={primarySub}
                                                shift={primaryShift}
                                                subtitleStyling={primaryStyling}
                                                checkLearningState={checkLearningState}
                                                changeLearningState={changeLearningState}/>}
            {showSecondarySub && <SecondarySubtitle
                currentTime={currentTime}
                subtitle={secondarySub}
                shift={secondaryShift}
                subtitleStyling={secondaryStyling}/>}
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