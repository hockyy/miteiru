import {useEffect} from "react";

export const usePlayNextAfterEnd = (player, currentTime, onVideoEndHandler, duration, changeTimeTo, setEnableSeeker) => {
  useEffect(() => {
    if (player && currentTime * 1000 === duration && duration > 0) {
      setEnableSeeker(false);
      onVideoEndHandler();
    }
  }, [player, currentTime, duration, changeTimeTo]);
}