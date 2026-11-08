import {useEffect, useRef} from "react";
import type {PlaybackClock} from "../utils/playbackClock";
import {buildLastVideo, saveLastVideo} from "../utils/continueWatching";

/** How often the position is saved while the video plays. */
export const SAVE_EVERY_MS = 5000;

type SaveLastVideoInput = {
  path: string;
  title: string;
  primarySubtitle: string;
  secondarySubtitle: string;
  clock: PlaybackClock;
  /** Milliseconds, as the player reports it. */
  durationMs: number;
  playing: boolean;
  /** Whether the current video has started (its time on the clock is its own, not the previous one's). */
  started: boolean;
};

const saveNow = (input: SaveLastVideoInput) => {
  if (!input.path || !input.started || input.clock.isPreviewing()) return;
  const video = buildLastVideo({
    path: input.path,
    title: input.title,
    position: input.clock.get(),
    duration: input.durationMs / 1000,
    primarySubtitle: input.primarySubtitle,
    secondarySubtitle: input.secondarySubtitle
  });
  saveLastVideo(window.electronStore, video).catch((error) => console.warn('[continue] could not save', error));
};

/**
 * Remembers the video being watched for "Continue watching": every few seconds while it plays, when
 * it is paused or its subtitles change, and when the page closes.
 */
export const useSaveLastVideo = (input: SaveLastVideoInput) => {
  const latest = useRef(input);
  latest.current = input;

  useEffect(() => {
    const save = () => saveNow(latest.current);
    const timer = window.setInterval(() => {
      if (latest.current.playing) save();
    }, SAVE_EVERY_MS);
    window.addEventListener('pagehide', save);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('pagehide', save);
      save();
    };
  }, []);

  const {path, playing, started, primarySubtitle, secondarySubtitle} = input;
  useEffect(() => {
    if (!playing) saveNow(latest.current);
  }, [path, playing, started, primarySubtitle, secondarySubtitle]);
};

export default useSaveLastVideo;
