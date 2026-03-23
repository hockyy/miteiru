import {useCallback, useEffect, useRef} from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import 'videojs-youtube';
import {videoConstants} from "../../utils/constants";
import PitchControl from "../Utils/PitchControl";


export const VideoJS = ({options, onReady, setCurrentTime, pitchValue}) => {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const pitchControlRef = useRef<PitchControl>(new PitchControl());
  const youtubeObserverRef = useRef<MutationObserver | null>(null);

  const handle = useCallback(() => {
    setCurrentTime(playerRef.current.currentTime())
  }, [setCurrentTime])

  useEffect(() => {
    pitchControlRef.current.setPitch(pitchValue);
  }, [pitchValue]);

  useEffect(() => {
    // Make sure Video.js player is only initialized once
    if (!playerRef.current) {
      const videoElement = document.createElement("video-js");
      videoElement.classList.add('vjs-big-play-centered');
      videoRef.current.appendChild(videoElement);

      const player = playerRef.current = videojs(videoElement, options, () => {
        const applyYouTubeIframeAttributes = () => {
          const iframe = player.el()?.querySelector("iframe");
          if (iframe) {
            iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
          }
        };

        onReady && onReady(player);
        applyYouTubeIframeAttributes();

        youtubeObserverRef.current = new MutationObserver(() => {
          applyYouTubeIframeAttributes();
        });
        youtubeObserverRef.current.observe(player.el(), {
          childList: true,
          subtree: true
        });

        // Initialize pitch control when player is ready
        const videoEl = player.el().querySelector('video');
        if (videoEl) {
          pitchControlRef.current.initialize(videoEl);
        }
      });
    } else {
      if (options.sources[0].src !== playerRef.current.currentSrc()) {
        playerRef.current.src(options.sources);
      }
    }
  }, [onReady, options, videoRef]);

  useEffect(() => {
    const interval = setInterval(() => {
      handle()
    }, videoConstants.subtitleFramerate);
    return () => clearInterval(interval);
  }, [handle]);

  useEffect(() => {
    return () => {
      if (youtubeObserverRef.current) {
        youtubeObserverRef.current.disconnect();
        youtubeObserverRef.current = null;
      }
      pitchControlRef.current.destroy();
    };
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