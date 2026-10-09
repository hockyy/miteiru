import {useCallback, useEffect, useState} from "react";
import {videoConstants} from "../utils/constants";
import {v4 as uuidv4} from 'uuid';
import {isTextEntryTarget} from "../utils/keyboardTargets";
import type {PlaybackClock} from "../utils/playbackClock";


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

export const useVideoKeyboardControls = (togglePlay, deltaTime, setPrimaryShift,
                                         setSecondaryShift, setInfo, backToHead, setIsPlaying) => {
  useEffect(() => {
    const handleVideoController = (event) => {
      // Typing in a search box or notes must not toggle playback or seek.
      if (isTextEntryTarget(event.target)) return;
      // Arrow keys on a focused slider move the slider, not the video.
      if (event.code.startsWith("Arrow") && event.target instanceof HTMLInputElement) return;
      const plainKey = !event.ctrlKey && !event.metaKey && !event.altKey;
      if (!plainKey && !event.code.startsWith("Bracket")) return;
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


export const useVideoTimeChanger = (player, clock: PlaybackClock, metadata) => {
  const [duration, setDuration] = useState(0);
  const [enableSeeker, setEnableSeeker] = useState(false);
  useEffect(() => {
    if (!player) return;
    // In ms; NaN until metadata loads, and YouTube reports it later through durationchange.
    const updateDuration = () => setDuration((player.duration() || 0) * 1000);
    updateDuration();
    player.on('durationchange', updateDuration);
    return () => player.off('durationchange', updateDuration);
  }, [player, metadata]);
  const changeTimeTo = useCallback((seekedTime: number) => {
    if (player) {
      clock.set(seekedTime)
      player.currentTime(seekedTime)
    }
  }, [player, clock])

  const deltaTime = useCallback((plusDelta: number) => {
    if (player) {
      changeTimeTo(player.currentTime() + plusDelta)
    }
  }, [changeTimeTo, player]);

  return {changeTimeTo, deltaTime, duration, setDuration, enableSeeker, setEnableSeeker};
}