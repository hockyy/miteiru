import {useEffect} from "react";

export const usePlayNextAfterEnd = (player,
                                    onVideoChangeHandler,
                                    setEnableSeeker,
                                    setIsPlaying) => {
  useEffect(() => {
    if (player) {
      // The end of a video pauses it; when the folder has a next video, that one plays.
      const ender = async () => {
        setEnableSeeker(false);
        if (await onVideoChangeHandler()) setIsPlaying(1);
      }
      player.on('ended', ender);
      return () => {
        player.off('ended', ender)
      }
    }
  }, [player, setEnableSeeker, onVideoChangeHandler, setIsPlaying]);
}