import "react-video-seek-slider/styles.css"
import {VideoSeekSlider} from "react-video-seek-slider";
import React, {useCallback} from "react";
import SmoothCollapse from "react-smooth-collapse";
import {Volume} from "./Volume";
import SettingsController from "./SettingsController";
import {ArrowLeft, ArrowRight, RepeatSubtitle, StepLeft, StepRight} from "./Icons";
import {toTime} from "../../utils/utils";
import {videoConstants} from "../../utils/constants";
import {Speed} from "./Speed";
import {Pitch} from "./Pitch";

export const VideoController = ({
                                  isPlaying,
                                  duration,
                                  changeTimeTo,
                                  deltaTime,
                                  togglePlay,
                                  player,
                                  currentTime,
                                  showController,
                                  setShowSidebar,
                                  enableSeeker,
                                  setEnableSeeker,
                                  onVideoChangeHandler,
                                  backToHead,
                                  setPitchValue
                                }) => {
  const step = useCallback((delta) => {
    if (enableSeeker) {
      setEnableSeeker(false)
      onVideoChangeHandler(delta);
    }
  }, [enableSeeker, onVideoChangeHandler, setEnableSeeker])
  const timeSeekerHandler = useCallback((seekedTime) => {
    if (enableSeeker) {
      changeTimeTo(seekedTime / 1000)
    }
  }, [enableSeeker, changeTimeTo])
  return <div>
    <div className={"w-[100vw] h-14 content-center -mb-4"}>
      <VideoSeekSlider
          max={duration}
          currentTime={currentTime * 1000}
          onChange={timeSeekerHandler}
      />
    </div>
    <SmoothCollapse className={"bg-gray-800/70 h-fit unselectable"}
                    eagerRender={true}
                    expanded={showController}>
      <div className={"flex flex-row items-center justify-between pt-1"}>
        <div className={"flex w-1/3 hidden lg:flex"}>
          <Volume player={player}/>
          <div className={"flex flex-row px-4 justify-end content-end w-32 animation"}>
            <div>{toTime(currentTime)}</div>
            &nbsp;
            <div>/</div>
            &nbsp;
            <div>{toTime(duration / 1000)}</div>
          </div>

        </div>
        <div className={"flex w-full justify-center items-center gap-4 lg:w-1/3"}>
          <button onClick={() => step(-1)}
                  className={"flex flex-row items-center gap-1 animation h-5"}>
            {StepLeft}
          </button>
          <button onClick={() => {
            deltaTime(-10)
          }} className={"flex flex-row items-center gap-1 animation h-5"}>
            {ArrowLeft} 10
          </button>
          <div
              className={"animation justify-self-center place-self-center rounded-lg p-1 m-3 w-fit h-fit playpause " + videoConstants.playingClass[isPlaying]}
              onClick={togglePlay}>
            <div className="button"></div>
          </div>
          <button onClick={() => {
            deltaTime(+10)
          }} className={"flex flex-row items-center gap-1 animation h-5"}>
            10 {ArrowRight}
          </button>
          <button onClick={() => step(1)}
                  className={"flex flex-row items-center gap-1 animation h-5"}>
            {StepRight}
          </button>
        </div>
        <div className={"flex w-1/3 justify-end hidden lg:flex"}>
          <button onClick={backToHead}
                  className={"flex flex-row items-center gap-1 animation h-5"}>
            {RepeatSubtitle}
          </button>
          <Speed player={player}/>
          <SettingsController setShowSidebar={setShowSidebar}/>
        </div>
      </div>

    </SmoothCollapse></div>
}