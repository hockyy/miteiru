import React, {useCallback, useEffect, useMemo, useRef} from "react";
import {toTime} from "../../utils/utils";
import type {PlaybackClock} from "../../utils/playbackClock";
import {findLineIndexAt, type Line} from "../Subtitle/DataStructures";

interface SeekBarProps {
  clock: PlaybackClock;
  // Video length in milliseconds (0 while unknown).
  durationMs: number;
  // Called with the chosen time in milliseconds.
  onSeek: (ms: number) => void;
  // End of the buffered range in seconds, if the player can tell.
  getBufferedEnd?: () => number;
  // The primary subtitle's lines, drawn as marks on the track and previewed in the tooltip.
  lines?: Line[];
  // The primary subtitle's shift in ms: a line at subtitle time t shows at video time t + shift.
  shiftMs?: number;
}

// A drag seeks at most this often (ms); the bar itself follows the pointer on every move.
const DRAG_SEEK_INTERVAL = 120;
// The buffered range changes slowly and also while paused, so it is polled rather than ticked.
const BUFFERED_POLL_INTERVAL = 1000;
// Longer lines are cut in the tooltip.
const PREVIEW_MAX_CHARS = 90;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** One SVG path with a rectangle per subtitle line, in video milliseconds (the SVG stretches it). */
export const cueMarksPath = (lines: Line[] | undefined, durationMs: number, shiftMs = 0) => {
  if (!lines?.length || durationMs <= 0) return "";
  let path = "";
  for (const line of lines) {
    const start = clamp(line.timeStart + shiftMs, 0, durationMs);
    const end = clamp(line.timeEnd + shiftMs, 0, durationMs);
    // A line covering the whole video (a single pasted text) says nothing about where speech is.
    if (end <= start || end - start >= durationMs) continue;
    path += `M${Math.round(start)} 0h${Math.round(end - start) || 1}v1h-${Math.round(end - start) || 1}z`;
  }
  return path;
};

/** The text of the line shown at video time `ms`, on one line and cut to a preview length. */
export const previewLineAt = (lines: Line[] | undefined, ms: number, shiftMs = 0) => {
  const index = findLineIndexAt(lines, ms - shiftMs);
  if (index < 0) return "";
  const text = (lines?.[index]?.text ?? "").replace(/\s+/g, " ").trim();
  return text.length > PREVIEW_MAX_CHARS ? text.slice(0, PREVIEW_MAX_CHARS - 1) + "…" : text;
};

/**
 * The video seek bar: a rounded track with the buffered range, the primary subtitle's lines,
 * a hover preview, the progress and a thumb, plus a tooltip with the time and the line at that time.
 * Everything that moves is written straight to the DOM from clock ticks and pointer events, so a
 * playing video re-renders nothing here.
 */
export const SeekBar = ({clock, durationMs, onSeek, getBufferedEnd, lines, shiftMs = 0}: SeekBarProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const bufferedRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef<HTMLDivElement>(null);
  const thumbRailRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipTimeRef = useRef<HTMLSpanElement>(null);
  const tooltipLineRef = useRef<HTMLSpanElement>(null);
  const draggingRef = useRef(false);
  const lastDragSeekRef = useRef(0);
  const durationRef = useRef(durationMs);
  durationRef.current = durationMs;
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const shiftRef = useRef(shiftMs);
  shiftRef.current = shiftMs;

  const cuePath = useMemo(() => cueMarksPath(lines, durationMs, shiftMs), [lines, durationMs, shiftMs]);

  const showProgress = useCallback((fraction: number) => {
    if (progressRef.current) progressRef.current.style.transform = `scaleX(${fraction})`;
    if (thumbRailRef.current) thumbRailRef.current.style.transform = `translateX(${fraction * 100}%)`;
    const seconds = fraction * durationRef.current / 1000;
    rootRef.current?.setAttribute("aria-valuenow", String(Math.round(seconds)));
    rootRef.current?.setAttribute("aria-valuetext", toTime(seconds));
  }, []);

  const showClockProgress = useCallback(() => {
    const duration = durationRef.current;
    showProgress(duration > 0 ? clamp(clock.get() * 1000 / duration, 0, 1) : 0);
  }, [clock, showProgress]);

  const fractionAt = (clientX: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect && rect.width > 0 ? clamp((clientX - rect.left) / rect.width, 0, 1) : 0;
  };

  const showHover = (fraction: number) => {
    const root = rootRef.current;
    const tooltip = tooltipRef.current;
    if (hoverRef.current) hoverRef.current.style.transform = `scaleX(${fraction})`;
    if (!root || !tooltip) return;
    const ms = fraction * durationRef.current;
    if (tooltipTimeRef.current) tooltipTimeRef.current.textContent = toTime(ms / 1000);
    if (tooltipLineRef.current) {
      const line = previewLineAt(linesRef.current, ms, shiftRef.current);
      tooltipLineRef.current.textContent = line;
      tooltipLineRef.current.hidden = line === "";
    }
    // Centre the tooltip on the pointer, but keep it inside the bar near either end.
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
      if (!draggingRef.current) showClockProgress();
    };
    update();
    return clock.subscribe(update);
  }, [clock, durationMs, showClockProgress]);

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
    if (!draggingRef.current) return;
    draggingRef.current = false;
    delete rootRef.current?.dataset.dragging;
    // If the player ignored the seek (say, while the next video loads), go back to where it really is.
    // A seek it accepted moves the clock, and the next tick shows that.
    showClockProgress();
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
    draggingRef.current = false;
    delete rootRef.current?.dataset.dragging;
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
        <div ref={bufferedRef} className="seek-bar__fill seek-bar__buffered"/>
        {cuePath && (
          <svg className="seek-bar__cues" viewBox={`0 0 ${Math.max(1, Math.round(durationMs))} 1`}
               preserveAspectRatio="none" aria-hidden="true">
            <path d={cuePath}/>
          </svg>
        )}
        <div ref={hoverRef} className="seek-bar__fill seek-bar__hover"/>
        <div ref={progressRef} className="seek-bar__fill seek-bar__progress"/>
      </div>
      <div ref={thumbRailRef} className="seek-bar__thumb-rail">
        <div className="seek-bar__thumb"/>
      </div>
      <div ref={tooltipRef} className="seek-bar__tooltip">
        <span ref={tooltipTimeRef} className="seek-bar__tooltip-time">00:00</span>
        <span ref={tooltipLineRef} className="seek-bar__tooltip-line" hidden/>
      </div>
    </div>
  );
};
