import React, {useCallback} from "react";
import {SeekBar} from "./SeekBar";
import {usePlaybackValue, type PlaybackClock} from "../../utils/playbackClock";
import SmoothCollapse from "../Utils/SmoothCollapse";
import {Volume} from "./Volume";
import SettingsController from "./SettingsController";
import {ArrowLeft, ArrowRight, RepeatSubtitle, StepLeft, StepRight} from "./Icons";
import {toTime} from "../../utils/utils";
import {videoConstants} from "../../utils/constants";
import {Speed} from "./Speed";

export const VideoController = ({
                                  isPlaying,
                                  duration,
                                  changeTimeTo,
                                  deltaTime,
                                  togglePlay,
                                  player,
                                  clock,
                                  showController,
                                  setShowSidebar,
                                  enableSeeker,
                                  setEnableSeeker,
                                  onVideoChangeHandler,
                                  canStepVideos = true,
                                  backToHead,
                                  primaryLines,
                                  primaryShift
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
  const getBufferedEnd = useCallback(() => player?.bufferedEnd?.() ?? 0, [player]);
  // A control clicked with the mouse takes no focus, so Space keeps playing and pausing instead of
  // pressing it again (keyboard focus with Tab still works).
  const keepFocusOff = useCallback((event: React.MouseEvent) => {
    if (event.target instanceof Element && event.target.closest("button")) event.preventDefault();
  }, []);
  // One panel: the seek bar sits inside it, inset to line up with the controls under it.
  return <div onMouseDown={keepFocusOff} className={"player-panel w-[100vw] pt-6"}>
    <div className={"px-4"}>
      <SeekBar clock={clock} durationMs={duration} onSeek={timeSeekerHandler} getBufferedEnd={getBufferedEnd}
               lines={primaryLines} shiftMs={primaryShift}/>
    </div>
    <SmoothCollapse className={"h-fit unselectable"}
                    eagerRender={true}
                    expanded={showController}>
      <div className={"flex flex-row items-center justify-between pb-1"}>
        {/* Volume and time go first when the window is narrow; the settings gear never does. */}
        <div className={"hidden w-1/3 md:flex"}>
          <Volume player={player}/>
          <div className={"flex flex-row px-2 lg:px-4 justify-end content-end lg:w-32 whitespace-nowrap animation"}>
            <div><PlaybackTime clock={clock}/></div>
            &nbsp;
            <div>/</div>
            &nbsp;
            <div>{toTime(duration / 1000)}</div>
          </div>

        </div>
        <div className={"flex flex-1 justify-center items-center gap-4 md:w-1/3 md:flex-none"}>
          {/* Only files in a folder have a previous and next video; a YouTube link has none. */}
          {canStepVideos && <button onClick={() => step(-1)} aria-label="Previous video" title="Previous video in the folder"
                  className={"flex flex-row items-center gap-1 animation h-5"}>
            {StepLeft}
          </button>}
          <button onClick={() => {
            deltaTime(-10)
          }} aria-label="Back 10 seconds" title="Back 10 seconds"
                  className={"flex flex-row items-center gap-1 animation h-5"}>
            {ArrowLeft} 10
          </button>
          <button
              className={"animation justify-self-center place-self-center rounded-lg p-1 m-3 w-fit h-fit playpause " + videoConstants.playingClass[isPlaying]}
              aria-label={isPlaying ? "Pause" : "Play"} title={isPlaying ? "Pause (Space)" : "Play (Space)"}
              onClick={togglePlay}>
            <div className="button"></div>
          </button>
          <button onClick={() => {
            deltaTime(+10)
          }} aria-label="Forward 10 seconds" title="Forward 10 seconds"
                  className={"flex flex-row items-center gap-1 animation h-5"}>
            10 {ArrowRight}
          </button>
          {canStepVideos && <button onClick={() => step(1)} aria-label="Next video" title="Next video in the folder"
                  className={"flex flex-row items-center gap-1 animation h-5"}>
            {StepRight}
          </button>}
        </div>
        <div className={"flex shrink-0 justify-end gap-2 md:w-1/3"}>
          <button onClick={backToHead} aria-label="Repeat line" title="Repeat the current line (R)"
                  className={"flex flex-row items-center gap-1 animation h-5"}>
            {RepeatSubtitle}
          </button>
          <Speed player={player}/>
          <SettingsController setShowSidebar={setShowSidebar}/>
        </div>
      </div>

    </SmoothCollapse></div>
}

// Re-renders once a second, not on every clock tick.
const PlaybackTime = ({clock}: { clock: PlaybackClock }) => <>{toTime(usePlaybackValue(clock, Math.floor))}</>;
