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
import useMecab from "../hooks/useMecab";
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

function Video() {
  const mecab = useMecab();
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
  } = useSubtitle(mecab);
  const {meaning, setMeaning} = useMeaning();
  const {
    duration,
    deltaTime,
    changeTimeTo,
    enableSeeker,
    setEnableSeeker
  } = useVideoTimeChanger(player, setCurrentTime, metadata);
  const {videoSrc, onLoadFiles, onVideoEndHandler} =
      useLoadFiles(setToastInfo,
          primarySub, setPrimarySub,
          secondarySub, setSecondarySub,
          mecab, setEnableSeeker, changeTimeTo, player);
  const {showController, setShowController, showSidebar, setShowSidebar} = useMenuDisplay();
  useKeyBind(setMeaning, setShowController, setShowSidebar, setPrimarySub, setSecondarySub, mecab);
  const {togglePlay, isPlaying} = useVideoPlayingToggle(player, metadata);
  useVideoKeyboardControls(togglePlay, deltaTime, setPrimaryShift, setSecondaryShift, setToastInfo);
  usePlayNextAfterEnd(player, currentTime, onVideoEndHandler, duration, setEnableSeeker)
  return (
      <React.Fragment>
        <Head>
          <title>{getMiteiruVideoTitle(videoSrc.path, primarySub.path, secondarySub.path)}</title>
        </Head>
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
                enableSeeker={enableSeeker}/>}
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