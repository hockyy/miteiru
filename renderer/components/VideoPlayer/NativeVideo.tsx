import {useEffect, useRef} from 'react';
import {videoConstants} from "../../utils/constants";
import type {PlaybackClock} from "../../utils/playbackClock";
import {NativePlayer} from "../../utils/nativePlayer";

/**
 * Local-file playback in the desktop shell: libmpv draws into the window behind the page, which
 * stays transparent over the video. Same props and player API as VideoJS, so the page and its
 * hooks don't need to know which one is running.
 */
export const NativeVideo = ({options, onReady, clock, onError}: {
  options: any;
  onReady: (player: any) => void;
  clock: PlaybackClock;
  /**
   * mpv could not play the source (YouTubeVideo then switches to the YouTube embed). `seconds` is
   * how far this source had played: 0 when it failed to start.
   */
  /** `reason` is set when the player couldn't start at all (it says why); a file that fails to play has none. */
  onError?: (seconds: number, reason?: string) => void;
}) => {
  const elementRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<NativePlayer | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Where the player is: still opening, ready for sources, or failed to start (then the next source
  // set tries to open it again). `wanted` is the latest source asked for, whenever that was.
  const phaseRef = useRef<'opening' | 'ready' | 'failed'>('opening');
  const wantedRef = useRef(options.sources);
  wantedRef.current = options.sources;
  const startRef = useRef<() => void>(() => undefined);
  // The loaded file stopped with an error; opening it again must load it again.
  const playbackFailedRef = useRef(false);

  useEffect(() => {
    const element = elementRef.current;
    const player = new NativePlayer(element);
    playerRef.current = player;
    player.on('error', () => {
      playbackFailedRef.current = true;
      onErrorRef.current?.(player.currentTime());
    });
    let cancelled = false;
    document.documentElement.classList.add('miteiru-native-video');
    const start = () => {
      phaseRef.current = 'opening';
      player.open()
          .then(() => {
            if (cancelled) return;
            phaseRef.current = 'ready';
            onReadyRef.current?.(player);
            // The source may have changed while opening; load the newest, not the first.
            player.src(wantedRef.current);
            player.updateRect();
          })
          .catch((error) => {
            console.error('[native-video] could not start the player', error);
            if (cancelled) return;
            phaseRef.current = 'failed';
            onErrorRef.current?.(0, error instanceof Error ? error.message : String(error));
          });
    };
    startRef.current = start;
    start();
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
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    const source = options.sources?.[0];
    if (!player || !source) return;
    // A failed start is tried again whenever a source is set (the same file again too).
    if (phaseRef.current === 'failed') {
      startRef.current();
      return;
    }
    // Still opening: open() loads the latest source when it finishes.
    if (phaseRef.current === 'opening') return;
    if (player.currentSrc() === '') return;
    if (source.src !== player.currentSrc() || playbackFailedRef.current) {
      playbackFailedRef.current = false;
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
