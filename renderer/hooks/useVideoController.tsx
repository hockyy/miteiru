import {useCallback, useEffect, useState} from "react";
import {videoConstants} from "../utils/constants";
import {v4 as uuidv4} from 'uuid';


export const useVideoPlayingToggle = (player, metadata) => {
  const [isPlaying, setIsPlaying] = useState(1);
  const togglePlay = useCallback(() => {
    setIsPlaying(val => {
      return (val ^ 1)
    })
  }, [setIsPlaying]);
  useEffect(() => {
    if (player) {
      if (isPlaying) {
        player.play()
      } else {
        player.pause()
      }
    }
  }, [isPlaying, metadata, player]);
  return {isPlaying, setIsPlaying, togglePlay};
}

export const useVideoKeyboardControls = (togglePlay, deltaTime, setPrimaryShift, setSecondaryShift, setInfo, backToHead, setIsPlaying) => {
  useEffect(() => {
    const handleVideoController = (event) => {
      if (event.code === "KeyE") {
        togglePlay()
      } else if (event.code === "ArrowLeft") {
        deltaTime(-2)
      } else if (event.code === "ArrowRight") {
        deltaTime(+2)
      } else if (event.code === "KeyR") {
        backToHead();
        setIsPlaying(1);
      } else if (event.code.startsWith("Bracket")) {
        const currentShiftAmount = event.code === "BracketLeft" ?
            -videoConstants.shiftAmount : videoConstants.shiftAmount;
        (event.ctrlKey ? setSecondaryShift : setPrimaryShift)(old => {
          setInfo(() => {
            return {
              message: `Shifting ${(event.ctrlKey ? "Secondary" : "Primary")} Sub to ${old + currentShiftAmount}ms`,
              udpate: uuidv4()
            }
          })
          return old + currentShiftAmount;
        })
      }
    };
    window.addEventListener('keydown', handleVideoController);
    return () => {
      window.removeEventListener('keydown', handleVideoController);
    };
  }, [togglePlay, deltaTime, setPrimaryShift, setSecondaryShift, setInfo, backToHead, setIsPlaying]);
}


export const useVideoTimeChanger = (player, setCurrentTime, metadata) => {
  const [duration, setDuration] = useState(0);
  const [enableSeeker, setEnableSeeker] = useState(false);
  useEffect(() => {
    if (player) {
      setDuration(player.duration() * 1000);
    }
  }, [player, metadata]);
  const changeTimeTo = useCallback((seekedTime: number) => {
    if (player) {
      setCurrentTime(seekedTime)
      player.currentTime(seekedTime)
    }
  }, [player, setCurrentTime])

  const deltaTime = useCallback((plusDelta: number) => {
    if (player) {
      changeTimeTo(player.currentTime() + plusDelta)
    }
  }, [changeTimeTo, player]);

  return {changeTimeTo, deltaTime, duration, setDuration, enableSeeker, setEnableSeeker};
}