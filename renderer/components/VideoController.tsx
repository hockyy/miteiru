import "react-video-seek-slider/styles.css"
import {VideoSeekSlider} from "react-video-seek-slider";
import {useEffect, useState} from "react";
import {Simulate} from "react-dom/test-utils";
import play = Simulate.play;
import SmoothCollapse from "react-smooth-collapse";

const playingClass = ["", "playing"]
export const VideoController = ({player, currentTime, metadata, showController}) => {
  const [duration, setDuration] = useState(0)
  useEffect(() => {
  }, [currentTime])

  useEffect(() => {
    setDuration(player.duration() * 1000)
  }, [metadata])
  const [playing, setPlaying] = useState(1);
  const togglePlay = () => {
    setPlaying(val => {
      return (val ^ 1)
    })
  }
  useEffect(() => {
    if (playing) {
      player.play()
    } else {
      player.pause()
    }
  }, [playing, metadata])
  useEffect(() => {
    const handleVideoController = (event) => {
      if (event.code === "Space") {
        togglePlay()
      }
    };
    window.addEventListener('keydown', handleVideoController);
    return () => {
      window.removeEventListener('keydown', handleVideoController);
    };
  }, []);
  return <SmoothCollapse className={"z-[15]"} eagerRender={true} expanded={showController}>
    <div className={"w-[100vw] h-6 content-center"}>
      <VideoSeekSlider
          max={duration}
          currentTime={currentTime * 1000}
          onChange={(seekedTime) => {
            player.currentTime(seekedTime / 1000)
          }}
      />
    </div>
    <div className={"flex flex-row justify-center content-center"}>
      <div className={"rounded-lg p-1 m-3 h-fit w-fit playpause " + playingClass[playing]}
           onClick={togglePlay}>
        <div className="button"></div>
      </div>
    </div>

  </SmoothCollapse>
}