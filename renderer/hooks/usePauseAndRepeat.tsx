import {useCallback, useEffect, useRef, useState} from "react";
import {usePlaybackTick, type PlaybackClock} from "../utils/playbackClock";
import {videoConstants} from "../utils/constants";
import {adjustTimeWithShift} from "../utils/utils";

/**
 * One auto-pause step at `adjustedTime` (shifted ms) for the line `timeCache` ([start, end] or []).
 * `pauseId` is the start of the line it may still pause at; it pauses once in the last frames of
 * that line, then not again until the time leaves the pause period.
 */
export const autoPauseStep = (
  timeCache: number[] | undefined,
  adjustedTime: number,
  autoPause: boolean,
  pauseId: number
): { pause: boolean; pauseId: number } => {
  if (!timeCache || timeCache.length != 2) return {pause: false, pauseId: -1};
  if (!autoPause) return {pause: false, pauseId: timeCache[0]};
  const pausePeriod = Math.max(timeCache[1] - videoConstants.subtitleFramerate * videoConstants.autoPauseMultiplier, timeCache[0]);
  if (pausePeriod <= adjustedTime && adjustedTime <= timeCache[1]) {
    return pauseId === timeCache[0] ? {pause: true, pauseId: -1} : {pause: false, pauseId};
  }
  return {pause: false, pauseId: timeCache[0]};
};

const usePauseAndRepeat = (timeCache: number[] | undefined,
                           clock: PlaybackClock,
                           shift: number,
                           setIsPlaying: (playing: number) => void,
                           changeTimeTo: (seconds: number) => void) => {
  // Start of the line auto-pause may still stop at; -1 once it paused there (or outside any line).
  const pauseIdRef = useRef(-1);
  const [autoPause, setAutoPause] = useState(false);
  const backToHead = useCallback(() => {
    if (!timeCache || timeCache.length != 2) {
      pauseIdRef.current = -1;
      return;
    }
    // timeCache is in shifted subtitle time (video ms - shift); convert back to video time.
    changeTimeTo((timeCache[0] + shift) / 1000);
  }, [timeCache, changeTimeTo, shift])

  // Pauses once near the end of each line. Runs on clock ticks, not renders.
  const checkAutoPause = (seconds: number) => {
    const step = autoPauseStep(timeCache, adjustTimeWithShift(seconds, shift), autoPause, pauseIdRef.current);
    pauseIdRef.current = step.pauseId;
    if (step.pause) setIsPlaying(0);
  };
  usePlaybackTick(clock, checkAutoPause);
  const checkRef = useRef(checkAutoPause);
  checkRef.current = checkAutoPause;
  // Also when the line, the shift or the setting changes while the clock stands still.
  useEffect(() => {
    checkRef.current(clock.get());
  }, [clock, timeCache, shift, autoPause]);
  return {autoPause, setAutoPause, backToHead};
}

export default usePauseAndRepeat;