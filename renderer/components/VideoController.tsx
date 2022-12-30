import "react-video-seek-slider/styles.css"
import {VideoSeekSlider} from "react-video-seek-slider";
import {useEffect, useState} from "react";

const playingClass = ["", "playing"]
export const VideoController = ({player, currentTime, metadata}) => {
  const [duration, setDuration] = useState(0)
  useEffect(() => {
  }, [currentTime])

  useEffect(() => {
    setDuration(player.duration() * 1000)
  }, [metadata])
  const [playing, setPlaying] = useState(0);
  useEffect(() => {
    console.log(player.paused())
  }, [playing])
  return <div className={"flex flex-col justify-end bottom-0 z-[200] fixed h-[100vh] w-[100vw]"}>
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
           onClick={() => {
             setPlaying(val => {
               return (val ^ 1)
             })
           }
           }>
        <div className="button"></div>
      </div>
    </div>

  </div>
}