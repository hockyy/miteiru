import React, {useEffect} from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import Subtitle from "./Subtitle";

export const VideoJS = (props) => {
  const videoRef = React.useRef(null);
  const playerRef = React.useRef(null);
  let playerState = playerRef.current;
  const handle = () => {
    console.log(playerState.currentTime())
  }
  const {options, onReady} = props;

  React.useEffect(() => {

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

      // You could update an existing player in the `else` block here
      // on prop change, for example:
    } else {
      const player = playerRef.current;
      player.autoplay(options.autoplay);
      player.src(options.sources);
      console.log(playerRef)
    }
  }, [options, videoRef]);

  // Dispose the Video.js player when the functional component unmounts
  React.useEffect(() => {
    playerState = playerRef.current;
    return () => {
      if (playerState && !playerState.isDisposed()) {
        playerState.dispose();
        playerRef.current = null;
      }
    };
  }, [playerRef]);

  return (
      <div>
        <div>
          <div className={'z-[-1] fixed w-[100vw]'}>
            <div data-vjs-player>
              <div ref={videoRef}></div>
            </div>
          </div>
          <Subtitle/>
        </div>
        <button onClick={handle}>Coba</button>
      </div>
  );
}

export default VideoJS;