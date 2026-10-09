import {useCallback, useEffect, useRef} from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import 'videojs-youtube';
import {videoConstants} from "../../utils/constants";
import type {PlaybackClock} from "../../utils/playbackClock";


export const VideoJS = ({options, onReady, clock}: { options: any; onReady: (player: any) => void; clock: PlaybackClock }) => {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const youtubeObserverRef = useRef<MutationObserver | null>(null);
  // The unmount cleanup tells the page the player is gone, using the latest callback.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const logPlayerState = useCallback((player, eventName: string) => {
    const mediaElement = player.el()?.querySelector('video') as HTMLVideoElement | null;
    const details = {
      event: eventName,
      currentSrc: player.currentSrc(),
      readyState: mediaElement?.readyState,
      networkState: mediaElement?.networkState,
      paused: player.paused(),
      currentTime: player.currentTime(),
      duration: player.duration(),
      mediaError: mediaElement?.error ? {
        code: mediaElement.error.code,
        message: mediaElement.error.message
      } : null,
      videoJsError: player.error()
    };

    if (eventName === 'error') {
      console.error('[video-load] player error', details);
    } else if (eventName === 'waiting' || eventName === 'stalled') {
      console.warn('[video-load] player event', details);
    } else {
      console.log('[video-load] player event', details);
    }
  }, []);

  // Samples the player into the clock; the clock only notifies when the time moved.
  const handle = useCallback(() => {
    const player = playerRef.current;
    if (player && !player.isDisposed()) clock.set(player.currentTime());
  }, [clock])

  useEffect(() => {
    // Make sure Video.js player is only initialized once
    if (!playerRef.current) {
      console.log('[video-load] initializing player', {sources: options.sources});
      const videoElement = document.createElement("video-js");
      videoElement.classList.add('vjs-big-play-centered');
      videoRef.current.appendChild(videoElement);

      const player = playerRef.current = videojs(videoElement, options, () => {
        console.log('[video-load] player ready', {
          currentSrc: player.currentSrc(),
          sources: options.sources
        });
        ['loadstart', 'loadeddata', 'canplay', 'playing', 'waiting', 'stalled', 'error']
          .forEach((eventName) => {
            player.on(eventName, () => logPlayerState(player, eventName));
          });

        const applyYouTubeIframeAttributes = () => {
          const iframe = player.el()?.querySelector("iframe");
          if (iframe) {
            iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
          }
        };

        onReady?.(player);
        applyYouTubeIframeAttributes();

        youtubeObserverRef.current = new MutationObserver(() => {
          applyYouTubeIframeAttributes();
        });
        youtubeObserverRef.current.observe(player.el(), {
          childList: true,
          subtree: true
        });
      });
    } else {
      if (options.sources[0].src !== playerRef.current.currentSrc()) {
        console.log('[video-load] changing source', {
          from: playerRef.current.currentSrc(),
          to: options.sources[0]
        });
        playerRef.current.src(options.sources);
      }
    }
  }, [logPlayerState, onReady, options, videoRef]);

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
      // Without this every closed video left a live player (and its media element) behind.
      const player = playerRef.current;
      if (player && !player.isDisposed()) {
        player.dispose();
        playerRef.current = null;
        onReadyRef.current?.(null);
      }
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