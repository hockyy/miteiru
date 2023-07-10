import {useEffect, useRef} from 'react';
import 'video.js/dist/video-js.css';

export const VideoJS = ({miteiruApi, options, onReady, setCurrentTime}) => {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const handle = () => {
    setCurrentTime(playerRef.current.player_.currentTime)
  }

  useEffect(() => {
    if (!miteiruApi) return;
    // Make sure Video.js player is only initialized once
    if (!playerRef.current) {
      // The Video.js player needs to be _inside_ the component el for React 18 Strict Mode.
      const videoElement = document.createElement("video-js");
      videoElement.classList.add('vjs-big-play-centered');
      videoRef.current.appendChild(videoElement);

      const player = playerRef.current = miteiruApi.videojs(videoElement, options, () => {
        miteiruApi.videojs.log('player is ready');
        onReady && onReady(player);
      });
    } else {
      if (options.sources[0].src !== playerRef.current.currentSrc()) {
        playerRef.current.src(options.sources);
      }
    }
  }, [options, videoRef, miteiruApi]);

  useEffect(() => {
    const interval = setInterval(() => {
      handle()
    }, 200);
    return () => clearInterval(interval);
  }, []);

  return (
      <div className={'z-0'}>
        <div className={"video-container"}>
          <div className={'video'} ref={videoRef}></div>
        </div>
      </div>
  );
}

export default VideoJS;