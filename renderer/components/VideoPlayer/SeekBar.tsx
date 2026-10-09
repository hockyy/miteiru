import React, {useCallback, useEffect, useRef} from "react";
import {toTime} from "../../utils/utils";
import type {PlaybackClock} from "../../utils/playbackClock";

interface SeekBarProps {
  clock: PlaybackClock;
  // Video length in milliseconds (0 while unknown).
  durationMs: number;
  // Called with the chosen time in milliseconds.
  onSeek: (ms: number) => void;
  // End of the buffered range in seconds, if the player can tell.
  getBufferedEnd?: () => number;
}

// A drag seeks at most this often (ms); the bar itself follows the pointer on every move.
const DRAG_SEEK_INTERVAL = 120;
// The buffered range changes slowly and also while paused, so it is polled rather than ticked.
const BUFFERED_POLL_INTERVAL = 1000;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * The video seek bar: progress, buffered range, hover preview, thumb and time tooltip, in the style
 * of react-video-seek-slider, which it replaces. Everything that moves is written straight to the
 * DOM from clock ticks and pointer events, so a playing video re-renders nothing here.
 */
export const SeekBar = ({clock, durationMs, onSeek, getBufferedEnd}: SeekBarProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const bufferedRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef<HTMLDivElement>(null);
  const thumbRailRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const lastDragSeekRef = useRef(0);
  const durationRef = useRef(durationMs);
  durationRef.current = durationMs;
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;

  const showProgress = useCallback((fraction: number) => {
    if (progressRef.current) progressRef.current.style.transform = `scaleX(${fraction})`;
    if (thumbRailRef.current) thumbRailRef.current.style.transform = `translateX(${fraction * 100}%)`;
    const seconds = fraction * durationRef.current / 1000;
    rootRef.current?.setAttribute("aria-valuenow", String(Math.round(seconds)));
    rootRef.current?.setAttribute("aria-valuetext", toTime(seconds));
  }, []);

  const fractionAt = (clientX: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect && rect.width > 0 ? clamp((clientX - rect.left) / rect.width, 0, 1) : 0;
  };

  const showHover = (fraction: number) => {
    const root = rootRef.current;
    const tooltip = tooltipRef.current;
    if (hoverRef.current) hoverRef.current.style.transform = `scaleX(${fraction})`;
    if (!root || !tooltip) return;
    tooltip.textContent = toTime(fraction * durationRef.current / 1000);
    // Keep the tooltip inside the bar near either end.
    const width = root.clientWidth;
    const half = tooltip.offsetWidth / 2;
    tooltip.style.transform = `translateX(${clamp(fraction * width, half, Math.max(half, width - half)) - half}px)`;
  };

  const seekTo = (fraction: number, force: boolean) => {
    const now = performance.now();
    if (durationRef.current <= 0 || (!force && now - lastDragSeekRef.current < DRAG_SEEK_INTERVAL)) return;
    lastDragSeekRef.current = now;
    onSeekRef.current(fraction * durationRef.current);
  };

  // Clock ticks move the progress, except while the user drags it.
  useEffect(() => {
    const update = () => {
      if (draggingRef.current) return;
      const duration = durationRef.current;
      showProgress(duration > 0 ? clamp(clock.get() * 1000 / duration, 0, 1) : 0);
    };
    update();
    return clock.subscribe(update);
  }, [clock, durationMs, showProgress]);

  useEffect(() => {
    if (!getBufferedEnd) return;
    const update = () => {
      const duration = durationRef.current;
      const end = duration > 0 ? clamp((getBufferedEnd() || 0) * 1000 / duration, 0, 1) : 0;
      if (bufferedRef.current) bufferedRef.current.style.transform = `scaleX(${end})`;
    };
    update();
    const timer = setInterval(update, BUFFERED_POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [getBufferedEnd, durationMs]);

  const stopDragging = () => {
    draggingRef.current = false;
    delete rootRef.current?.dataset.dragging;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = true;
    event.currentTarget.dataset.dragging = "true";
    const fraction = fractionAt(event.clientX);
    showProgress(fraction);
    showHover(fraction);
    seekTo(fraction, true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const fraction = fractionAt(event.clientX);
    showHover(fraction);
    if (!draggingRef.current) return;
    showProgress(fraction);
    seekTo(fraction, false);
  };

  // Arrow keys already seek ±2 s from anywhere on the page (useVideoKeyboardControls); Home/End jump.
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    seekTo(event.key === "Home" ? 0 : 1, true);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const fraction = fractionAt(event.clientX);
    showProgress(fraction);
    // The final position always seeks, even right after a throttled one.
    seekTo(fraction, true);
    stopDragging();
  };

  return (
    <div
      ref={rootRef}
      className="seek-bar"
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(durationMs / 1000)}
      aria-valuenow={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={stopDragging}
      onLostPointerCapture={stopDragging}
    >
      <div className="seek-bar__track">
        <div ref={hoverRef} className="seek-bar__fill seek-bar__hover"/>
        <div ref={bufferedRef} className="seek-bar__fill seek-bar__buffered"/>
        <div ref={progressRef} className="seek-bar__fill seek-bar__progress"/>
      </div>
      <div ref={thumbRailRef} className="seek-bar__thumb-rail">
        <div className="seek-bar__thumb"/>
      </div>
      <div ref={tooltipRef} className="seek-bar__tooltip">00:00</div>
    </div>
  );
};
