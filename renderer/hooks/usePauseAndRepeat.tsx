import {useCallback, useEffect, useRef, useState} from "react";
import {usePlaybackTick, type PlaybackClock} from "../utils/playbackClock";
import {videoConstants} from "../utils/constants";
import {adjustTimeWithShift} from "../utils/utils";

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
    if (!timeCache || timeCache.length != 2) {
      pauseIdRef.current = -1;
      return;
    }
    if (!autoPause) {
      pauseIdRef.current = timeCache[0];
      return;
    }
    let pausePeriod = timeCache[1] - videoConstants.subtitleFramerate * videoConstants.autoPauseMultiplier;
    pausePeriod = Math.max(pausePeriod, timeCache[0]);
    const currentAdjustedTime = adjustTimeWithShift(seconds, shift);
    if (pausePeriod <= currentAdjustedTime && currentAdjustedTime <= timeCache[1]) {
      // Inside pause period
      if (pauseIdRef.current === timeCache[0]) {
        setIsPlaying(0);
        pauseIdRef.current = -1;
      }
    } else {
      pauseIdRef.current = timeCache[0];
    }
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