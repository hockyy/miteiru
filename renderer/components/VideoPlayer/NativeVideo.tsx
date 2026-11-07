import {useEffect, useRef} from 'react';
import {videoConstants} from "../../utils/constants";
import type {PlaybackClock} from "../../utils/playbackClock";
import {NativePlayer} from "../../utils/nativePlayer";

/**
 * Local-file playback in the desktop shell: libmpv draws into the window behind the page, which
 * stays transparent over the video. Same props and player API as VideoJS, so the page and its
 * hooks don't need to know which one is running.
 */
export const NativeVideo = ({options, onReady, clock}: { options: any; onReady: (player: any) => void; clock: PlaybackClock }) => {
  const elementRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<NativePlayer | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const element = elementRef.current;
    const player = new NativePlayer(element);
    playerRef.current = player;
    let cancelled = false;
    document.documentElement.classList.add('miteiru-native-video');
    player.open()
        .then(() => {
          if (cancelled) return;
          onReadyRef.current?.(player);
          player.src(options.sources);
          player.updateRect();
        })
        .catch((error) => console.error('[native-video] could not start the player', error));
    const resize = new ResizeObserver(() => player.updateRect());
    resize.observe(element);
    return () => {
      cancelled = true;
      resize.disconnect();
      document.documentElement.classList.remove('miteiru-native-video');
      player.dispose();
      playerRef.current = null;
      onReadyRef.current?.(null);
    };
    // Mount once; source changes go through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    const source = options.sources?.[0];
    if (player && source && source.src !== player.currentSrc() && player.currentSrc() !== '') {
      player.src(options.sources);
    }
  }, [options]);

  useEffect(() => {
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (player && !player.isDisposed()) clock.set(player.currentTime());
    }, videoConstants.subtitleFramerate);
    return () => clearInterval(interval);
  }, [clock]);

  return (
      <div className={'z-0'} style={{pointerEvents: 'none'}}>
        <div className={"video-container"}>
          <div className={'video'} ref={elementRef}></div>
        </div>
      </div>
  );
};
