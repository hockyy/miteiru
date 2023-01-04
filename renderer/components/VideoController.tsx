import "react-video-seek-slider/styles.css"
import {VideoSeekSlider} from "react-video-seek-slider";
import React, {useEffect, useState} from "react";
import SmoothCollapse from "react-smooth-collapse";
import {Volume} from "./Volume";
import SettingsController from "./SettingsController";
import {ArrowLeft, ArrowRight} from "./Icons";
import {randomUUID} from "crypto";

const playingClass = ["", "playing"]
const shiftAmount = 100;

export const toTime = (time: number) => {
  time = Math.trunc(time)
  let seconds = time % 60;
  time -= seconds;
  time /= 60;
  let minutes = time % 60;
  time -= minutes;
  time /= 60;
  let hours = time;

  return `${hours > 0 ? (hours + ':') : ''}${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

export const VideoController = ({
                                  player,
                                  setCurrentTime,
                                  currentTime,
                                  metadata,
                                  showController,
                                  setPrimaryShift,
                                  setSecondaryShift,
                                  setInfo
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
  const [shift, setShift] = useState(0);
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
        deltaTime(-2)
      } else if (event.code === "ArrowRight") {
        deltaTime(+2)
      } else if (event.code.startsWith("Bracket")) {
        const currentShiftAmount = event.code === "BracketLeft" ? -shiftAmount : shiftAmount;
        (event.ctrlKey ? setSecondaryShift : setPrimaryShift)(old => {
          console.log("Here", old)
          setInfo(() => {
            return {
              message: `Shifting ${(event.ctrlKey ? "Secondary" : "Primary")} Sub to ${old + currentShiftAmount}ms`,
              udpate: randomUUID()
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
    <SmoothCollapse className={"z-[15] bg-gray-800/70 h-fit unselectable"}
                    eagerRender={true}
                    expanded={showController}>
      <div className={"flex flex-row items-center justify-between pt-1"}>
        <div className={"flex w-1/3"}>
          <Volume player={player}/>
          <div className={"flex flex-row px-4 justify-end content-end w-32 animation"}>
            <div>{toTime(currentTime)}</div>
            &nbsp;
            <div>/</div>
            &nbsp;
            <div>{toTime(duration / 1000)}</div>
          </div>
        </div>
        <div className={"flex w-1/3 justify-center items-center gap-4"}>
          <button onClick={() => {
            deltaTime(-10)
          }} className={"flex flex-row items-center gap-1 animation h-5"}>
            {ArrowLeft} 10
          </button>
          <div
              className={"animation justify-self-center place-self-center rounded-lg p-1 m-3 w-fit h-fit playpause " + playingClass[playing]}
              onClick={togglePlay}>
            <div className="button"></div>
          </div>
          <button onClick={() => {
            deltaTime(+10)
          }} className={"flex flex-row items-center gap-1 animation h-5"}>
            10 {ArrowRight}
          </button>
        </div>
        <div className={"flex w-1/3 justify-end"}>
          <SettingsController/>
        </div>
      </div>

    </SmoothCollapse></div>
}