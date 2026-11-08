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
  // Prepared Box tips in subtitle milliseconds, retained after their cue has played.
  tipRanges?: readonly TipRange[];
  // The primary subtitle's shift in ms: a line at subtitle time t shows at video time t + shift.
  shiftMs?: number;
  disabled?: boolean;
}

export interface TipRange { from: number; to: number }

// A drag seeks at most this often (ms); the bar and the subtitles follow the pointer on every move.
export const DRAG_SEEK_INTERVAL = 120;
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

/** Sorted, merged video-time ranges; built only when prepared tips, duration or subtitle shift change. */
export const prepareTipRanges = (ranges: readonly TipRange[] | undefined, durationMs: number, shiftMs = 0): TipRange[] => {
  if (!ranges?.length || !Number.isFinite(durationMs) || durationMs <= 0 || !Number.isFinite(shiftMs)) return [];
  const sorted = ranges.filter((range) => Number.isFinite(range.from) && Number.isFinite(range.to) && range.to > range.from)
    .map((range) => ({from: clamp(range.from + shiftMs, 0, durationMs), to: clamp(range.to + shiftMs, 0, durationMs)}))
    .filter((range) => range.to > range.from).sort((a, b) => a.from - b.from || a.to - b.to);
  const merged: TipRange[] = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && range.from <= previous.to) previous.to = Math.max(previous.to, range.to);
    else merged.push(range);
  }
  return merged;
};

export const tipMarksPath = (ranges: readonly TipRange[]) => ranges.map(({from, to}) => {
  const width = Math.max(1, Math.round(to) - Math.round(from));
  return `M${Math.round(from)} 0h${width}v1h-${width}z`;
}).join('');

/** Hovering a long video's history never scans every prepared tip. End bounds are exclusive. */
export const hasTipAt = (ranges: readonly TipRange[], videoMs: number): boolean => {
  if (!Number.isFinite(videoMs)) return false;
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const range = ranges[middle];
    if (videoMs < range.from) high = middle - 1;
    else if (videoMs >= range.to) low = middle + 1;
    else return true;
  }
  return false;
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
export const SeekBar = ({clock, durationMs, onSeek, getBufferedEnd, lines, tipRanges, shiftMs = 0, disabled = false}: SeekBarProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const bufferedRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef<HTMLDivElement>(null);
  const thumbRailRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipTimeRef = useRef<HTMLSpanElement>(null);
  const tooltipLineRef = useRef<HTMLSpanElement>(null);
  const tooltipTipRef = useRef<HTMLSpanElement>(null);
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
  const preparedTips = useMemo(() => prepareTipRanges(tipRanges, durationMs, shiftMs), [tipRanges, durationMs, shiftMs]);
  const tipPath = useMemo(() => tipMarksPath(preparedTips), [preparedTips]);
  const preparedTipsRef = useRef(preparedTips);
  preparedTipsRef.current = preparedTips;

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
    if (tooltipTipRef.current) tooltipTipRef.current.hidden = !hasTipAt(preparedTipsRef.current, ms);
    // Centre the tooltip on the pointer, but keep it inside the bar near either end.
    const width = root.clientWidth;
    const half = tooltip.offsetWidth / 2;
    tooltip.style.transform = `translateX(${clamp(fraction * width, half, Math.max(half, width - half)) - half}px)`;
  };

  const previewTo = (fraction: number) => {
    if (disabled || durationRef.current <= 0) return;
    showProgress(fraction);
    clock.preview(fraction * durationRef.current / 1000);
  };

  // Throttled while dragging so the picture scrubs without flooding the player; `force` always seeks.
  const seekTo = (fraction: number, force: boolean) => {
    const now = performance.now();
    if (disabled || durationRef.current <= 0 || (!force && now - lastDragSeekRef.current < DRAG_SEEK_INTERVAL)) return;
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

  useEffect(() => () => {
    if (draggingRef.current) clock.cancelPreview();
  }, [clock]);

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
    clock.cancelPreview();
    // If the player ignored the seek (say, while the next video loads), go back to where it really is.
    // A seek it accepted moves the clock, and the next tick shows that.
    showClockProgress();
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || disabled || durationRef.current <= 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = true;
    event.currentTarget.dataset.dragging = "true";
    const fraction = fractionAt(event.clientX);
    previewTo(fraction);
    showHover(fraction);
    seekTo(fraction, true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const fraction = fractionAt(event.clientX);
    showHover(fraction);
    if (!draggingRef.current) return;
    previewTo(fraction);
    seekTo(fraction, false);
  };

  // Arrow keys already seek from anywhere on the page (useVideoKeyboardControls); Home/End jump.
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && draggingRef.current) {
      event.preventDefault();
      event.stopPropagation();
      stopDragging();
      return;
    }
    if (event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    seekTo(event.key === "Home" ? 0 : 1, true);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    if (disabled || durationRef.current <= 0) { stopDragging(); return; }
    const fraction = fractionAt(event.clientX);
    previewTo(fraction);
    // The final position always seeks, even right after a throttled one.
    try {
      seekTo(fraction, true);
      clock.commitPreview(fraction * durationRef.current / 1000);
    } catch (error) {
      clock.cancelPreview();
      throw error;
    } finally {
      draggingRef.current = false;
      delete rootRef.current?.dataset.dragging;
    }
  };

  return (
    <div
      ref={rootRef}
      className="seek-bar"
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-disabled={disabled || durationMs <= 0}
      aria-valuemin={0}
      aria-valuemax={Math.round(durationMs / 1000)}
      aria-valuenow={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={stopDragging}
      onLostPointerCapture={stopDragging}
      onBlur={stopDragging}
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
        {tipPath && (
          <svg className="seek-bar__tips" viewBox={`0 0 ${Math.max(1, Math.round(durationMs))} 1`}
               preserveAspectRatio="none" aria-hidden="true">
            <path d={tipPath} vectorEffect="non-scaling-stroke"/>
          </svg>
        )}
      </div>
      <div ref={thumbRailRef} className="seek-bar__thumb-rail">
        <div className="seek-bar__thumb"/>
      </div>
      <div ref={tooltipRef} className="seek-bar__tooltip">
        <span ref={tooltipTimeRef} className="seek-bar__tooltip-time">00:00</span>
        <span ref={tooltipLineRef} className="seek-bar__tooltip-line" hidden/>
        <span ref={tooltipTipRef} className="seek-bar__tooltip-tip" hidden>Box tip</span>
      </div>
    </div>
  );
};
