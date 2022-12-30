import "react-video-seek-slider/styles.css"
import {VideoSeekSlider} from "react-video-seek-slider";
import React, {useEffect, useState} from "react";
import SmoothCollapse from "react-smooth-collapse";
import {Volume} from "./Volume";
import SettingsController from "./SettingsController";

const playingClass = ["", "playing"]
export const VideoController = ({
                                  player,
                                  setCurrentTime,
                                  currentTime,
                                  metadata,
                                  showController
                                }) => {
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    setDuration(player.duration() * 1000)
  }, [metadata])
  const [playing, setPlaying] = useState(1);
  const togglePlay = () => {
    setPlaying(val => {
      return (val ^ 1)
    })
  }
  const changeTimeTo = (seekedTime: number) => {
    setCurrentTime(seekedTime)
    player.currentTime(seekedTime)
  }
  const deltaTime = (plusDelta: number) => {
    changeTimeTo(player.currentTime() + plusDelta)
  }
  useEffect(() => {
    if (playing) {
      player.play()
    } else {
      player.pause()
    }
  }, [playing, metadata])
  // https://www.freecodecamp.org/news/javascript-keycode-list-keypress-event-key-codes/
  useEffect(() => {
    const handleVideoController = (event) => {
      if (event.code === "Space") {
        togglePlay()
      } else if (event.code === "ArrowLeft") {
        deltaTime(-10)
      } else if (event.code === "ArrowRight") {
        deltaTime(+10)
      }
    };
    window.addEventListener('keydown', handleVideoController);
    return () => {
      window.removeEventListener('keydown', handleVideoController);
    };
  }, []);
  return <div>
    <div className={"w-[100vw] h-6 content-center -mb-4"}>
      <VideoSeekSlider
          max={duration}
          currentTime={currentTime * 1000}
          onChange={(seekedTime) => {
            changeTimeTo(seekedTime / 1000)
          }}
      />
    </div>
    <SmoothCollapse className={"z-[15] bg-gray-800/70 h-fit"}
                    eagerRender={true}
                    expanded={showController}>
      <div className={"flex flex-row items-center justify-between"}>
        <div className={"flex w-1/3 justify-start"}>
          <Volume/>
        </div>
        <div className={"flex w-1/3 justify-center"}>
          <div
              className={"animation justify-self-center place-self-center rounded-lg p-1 m-3 w-fit h-fit playpause " + playingClass[playing]}
              onClick={togglePlay}>
            <div className="button"></div>
          </div>
        </div>
        <div className={"flex w-1/3 justify-end"}>
          <SettingsController/>
        </div>
      </div>

    </SmoothCollapse></div>
}