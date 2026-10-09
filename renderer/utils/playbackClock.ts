import {useEffect, useRef, useState, useSyncExternalStore} from "react";

/**
 * The video's current time in seconds. VideoJS samples the player about 33 times a second; keeping
 * that in page state re-rendered the whole video page on every sample. Components subscribe to the
 * clock instead and re-render only when what they show changes.
 */
export class PlaybackClock {
  private seconds = 0;
  private readonly listeners = new Set<() => void>();

  get = (): number => this.seconds;

  /** Updates the time; listeners run only when it actually changed (a paused video costs nothing). */
  set = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds === this.seconds) return;
    this.seconds = seconds;
    this.listeners.forEach((listener) => listener());
  };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

/** A component's own clock, created once. */
export const usePlaybackClockInstance = () => useState(() => new PlaybackClock())[0];

/**
 * Re-renders only when `select(seconds)` changes; `select` must return a primitive, e.g.
 * `Math.floor` for a once-a-second time display.
 */
export const usePlaybackValue = <T extends string | number | boolean | null>(
  clock: PlaybackClock,
  select: (seconds: number) => T
): T => useSyncExternalStore(clock.subscribe, () => select(clock.get()));

/** Calls `onTick(seconds)` on every clock change without re-rendering; the latest callback is used. */
export const usePlaybackTick = (clock: PlaybackClock | undefined, onTick: (seconds: number) => void) => {
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;
  useEffect(() => {
    if (!clock) return;
    return clock.subscribe(() => onTickRef.current(clock.get()));
  }, [clock]);
};
