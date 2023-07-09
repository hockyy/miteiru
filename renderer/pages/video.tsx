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

function Video() {
  const {meaning, setMeaning} = useMeaning();
  const {toastInfo, setToastInfo} = useMiteiruToast();
  const mecab = useMecab();
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
    resetSub
  } = useSubtitle(mecab);
  const {videoSrc, onLoadFiles} = useLoadFiles(setToastInfo, setPrimarySub, setSecondarySub, mecab);
  const {showController, setShowController, showSidebar, setShowSidebar} = useMenuDisplay();
  const {
    readyCallback,
    metadata,
    player,
    currentTime,
    setCurrentTime
  } = useReadyPlayerCallback(resetSub, setPrimarySub, setSecondarySub, videoSrc);

  useKeyBind(setMeaning, setShowController, setShowSidebar, setPrimarySub, setSecondarySub, mecab);

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