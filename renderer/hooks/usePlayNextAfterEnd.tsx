import {useEffect} from "react";

export const usePlayNextAfterEnd = (player,
                                    currentTime,
                                    onVideoChangeHandler,
                                    duration,
                                    setEnableSeeker) => {
  useEffect(() => {
    if (player) {
      const ender = () => {
        setEnableSeeker(false);
        onVideoChangeHandler();
      }
      player.on('ended', ender);
      return () => {
        player.off('ended', ender)
      }
    }
  }, [player, currentTime, duration, setEnableSeeker, onVideoChangeHandler]);
}