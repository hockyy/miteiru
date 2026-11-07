import {useEffect} from "react";

export const usePlayNextAfterEnd = (player,
                                    onVideoChangeHandler,
                                    setEnableSeeker,
                                    setIsPlaying) => {
  useEffect(() => {
    if (player) {
      // The end of a video pauses it; when the folder has a next video, that one plays.
      // The seek bar is off while the next video loads; onVideoChangeHandler turns it back on when there
      // is no next one (a YouTube video, the last file), and so does a failure here.
      const ender = async () => {
        setEnableSeeker(false);
        try {
          if (await onVideoChangeHandler()) setIsPlaying(1);
        } catch (error) {
          console.error('[video] could not open the next video', error);
          setEnableSeeker(true);
        }
      }
      player.on('ended', ender);
      return () => {
        player.off('ended', ender)
      }
    }
  }, [player, setEnableSeeker, onVideoChangeHandler, setIsPlaying]);
}
