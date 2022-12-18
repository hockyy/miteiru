import React, {useEffect} from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

export const MiteiruPlayer = ({videoSrc}) => {
  useEffect(() => {
    const video = document.getElementById("miteiru-player");
    video.pause()
    video.load()
    video.play();
  }, [videoSrc]);
  useEffect(()=>{
    const video = document.getElementById("miteiru-player");
    setInterval(()=>{
      console.log(video.currentTime)
    }, 10000)
  })
  return (<video id="miteiru-player" className={"w-full"} controls>
    {/*<source src={videoSrc.src} type={videoSrc.type}/>*/}
    <source src={videoSrc.src} type={videoSrc.type}/>
    {/*<source src="movie.ogg" type="video/ogg"/>*/}
    Your browser does not support the video tag.
  </video>)
}

export default MiteiruPlayer;