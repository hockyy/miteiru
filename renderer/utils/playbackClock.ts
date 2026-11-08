import {useEffect, useRef, useState, useSyncExternalStore} from "react";

/** A seek target never below 0: for mpv a negative absolute seek counts back from the end of the file. */
export const seekSeconds = (target: number): number => (Number.isFinite(target) ? Math.max(0, target) : 0);

/**
 * The video's current time in seconds. VideoJS samples the player about 33 times a second; keeping
 * that in page state re-rendered the whole video page on every sample. Components subscribe to the
 * clock instead and re-render only when what they show changes.
 */
export class PlaybackClock {
  private seconds = 0;
  private previewSeconds: number | null = null;
  private pendingSeek: {seconds: number; until: number} | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly now: () => number = () => performance.now()) {}

  get = (): number => this.previewSeconds ?? this.pendingSeek?.seconds ?? this.seconds;

  /** A drag previews the timeline without issuing a player seek or starting paid look-ahead work. */
  isPreviewing = (): boolean => this.previewSeconds !== null;

  preview = (seconds: number) => {
    if (!Number.isFinite(seconds)) return;
    const previous = this.get();
    const started = this.previewSeconds === null;
    this.previewSeconds = seekSeconds(seconds);
    if (started) this.pendingSeek = null;
    if (started || this.get() !== previous) this.notify();
  };

  cancelPreview = () => {
    if (this.previewSeconds === null) return;
    this.previewSeconds = null;
    this.notify();
  };

  /** Hold the committed target while an asynchronous YouTube seek still reports the old frame. */
  commitPreview = (seconds: number) => {
    if (!Number.isFinite(seconds)) return this.cancelPreview();
    this.previewSeconds = null;
    this.pendingSeek = {seconds: seekSeconds(seconds), until: this.now() + 3000};
    // Notify even when the visible time is unchanged: look-ahead work resumes on release.
    this.notify();
  };

  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  /** Updates the time; listeners run only when it actually changed (a paused video costs nothing). */
  set = (seconds: number) => {
    if (!Number.isFinite(seconds)) return;
    const previous = this.get();
    this.seconds = seconds;
    if (this.pendingSeek && (Math.abs(seconds - this.pendingSeek.seconds) <= 1 || this.now() >= this.pendingSeek.until)) this.pendingSeek = null;
    if (this.get() !== previous) this.notify();
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
): T => useSyncExternalStore(clock.subscribe, () => select(clock.get()), () => select(0));

/** Calls `onTick(seconds)` on every clock change without re-rendering; the latest callback is used. */
export const usePlaybackTick = (clock: PlaybackClock | undefined, onTick: (seconds: number) => void) => {
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;
  useEffect(() => {
    if (!clock) return;
    return clock.subscribe(() => onTickRef.current(clock.get()));
  }, [clock]);
};
