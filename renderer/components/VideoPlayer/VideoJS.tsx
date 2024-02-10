import {useEffect, useRef} from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import 'videojs-youtube';
import {videoConstants} from "../../utils/constants";  // Import the YouTube plugin


export const VideoJS = ({options, onReady, setCurrentTime}) => {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const handle = () => {
    setCurrentTime(playerRef.current.currentTime())
  }

  useEffect(() => {
    // Make sure Video.js player is only initialized once
    if (!playerRef.current) {
      // The Video.js player needs to be _inside_ the component el for React 18 Strict Mode.
      const videoElement = document.createElement("video-js");
      videoElement.classList.add('vjs-big-play-centered');
      videoRef.current.appendChild(videoElement);

      const player = playerRef.current = videojs(videoElement, options, () => {
        onReady && onReady(player);
      });
    } else {
      if (options.sources[0].src !== playerRef.current.currentSrc()) {
        playerRef.current.src(options.sources);
      }
    }
  }, [options, videoRef]);

  useEffect(() => {
    const interval = setInterval(() => {
      handle()
    }, videoConstants.subtitleFramerate);
    return () => clearInterval(interval);
  }, []);

  return (
      <div className={'z-0'} style={{pointerEvents: 'none'}}>
        <div className={"video-container"}>
          <div className={'video'} ref={videoRef}></div>
        </div>
      </div>
  );
}

export default VideoJS;