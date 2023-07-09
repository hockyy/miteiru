import {useEffect} from "react";

export const usePlayNextAfterEnd = (player,
                                    currentTime,
                                    onVideoEndHandler,
                                    duration,
                                    setEnableSeeker) => {
  useEffect(() => {
    if (player) {
      const ender = () => {
        setEnableSeeker(false);
        onVideoEndHandler();
      }
      player.on('ended', ender);
      return () => {
        player.off('ended', ender)
      }
    }
  }, [player, currentTime, duration]);
}