import {useEffect, useRef} from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

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
        videojs.log('player is ready');
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
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
      <div>
        <div>
          <div className={'z-[-1] fixed w-[100vw]'}>
            <div data-vjs-player>
              <div ref={videoRef}></div>
            </div>
          </div>
        </div>
        <button onClick={handle} style={{
          position: 'fixed',
          top: '80vh'
        }}>Coba
        </button>
      </div>
  );
}

export default VideoJS;