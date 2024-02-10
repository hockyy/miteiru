import {useCallback, useEffect, useState} from "react";
import {videoConstants} from "../utils/constants";
import {adjustTimeWithShift} from "../utils/utils";

const usePauseAndRepeat = (timeCache: any,
                           player: any,
                           currentTime: number,
                           shift: number,
                           setIsPlaying: any,
                           changeTimeTo: any) => {
  const [pauseId, setPauseId] = useState<number>(-1);
  const [autoPause, setAutoPause] = useState(false);
  const backToHead = useCallback(() => {
    if (!timeCache || timeCache.length != 2) {
      setPauseId(-1);
      return;
    }
    changeTimeTo(timeCache[0] / 1000);
  }, [timeCache, changeTimeTo])
  useEffect(() => {
    if (!timeCache || timeCache.length != 2) {
      setPauseId(-1);
      return;
    }
    if (!autoPause) {
      setPauseId(timeCache[0]);
      return;
    }
    let pausePeriod = timeCache[1] - videoConstants.subtitleFramerate * 1.02;
    pausePeriod = Math.max(pausePeriod, timeCache[0]);
    const currentAdjustedTime = adjustTimeWithShift(currentTime, shift);
    if (pausePeriod <= currentAdjustedTime && currentAdjustedTime <= timeCache[1]) {
      // Inside pause period
      if (pauseId === timeCache[0]) {
        setIsPlaying(0);
        setPauseId(-1);
      }
    } else {
      setPauseId(timeCache[0]);
    }
  }, [currentTime, timeCache, setIsPlaying, shift]);
  return {autoPause, setAutoPause, backToHead};
}

export default usePauseAndRepeat;