import {videoConstants} from "./constants";

/**
 * Subtitle timing, in the words the learner reads.
 *
 * The shift is in milliseconds and `adjustTimeWithShift` (utils.ts) looks a line up at
 * `video time - shift`. So a positive shift finds each line only once the video is further along:
 * every line appears LATER. A negative shift makes lines appear EARLIER. `]` adds a step and `[`
 * takes one away; the shortcut sheet says "earlier" for `[` and "later" for `]` to match.
 */

/** How far one press of `[` or `]`, or one click on the timing buttons, moves a subtitle. */
export const SHIFT_STEP_MS: number = videoConstants.shiftAmount;

const seconds = (ms: number): string => {
  const value = Math.abs(ms) / 1000;
  // Steps are 0.1 s, so one decimal reads naturally; anything finer keeps its second one.
  return `${Math.abs(ms) % 100 === 0 ? value.toFixed(1) : value.toFixed(2)} s`;
};

/** "0.3 s later", "0.2 s earlier" or "on time". */
export const describeSubtitleShift = (shiftMs: number): string => {
  if (!shiftMs) return "on time";
  return `${seconds(shiftMs)} ${shiftMs > 0 ? "later" : "earlier"}`;
};

/** What the toast says after `[` or `]`: "Japanese subtitles now 0.3 s later". */
export const subtitleShiftToast = (name: string, shiftMs: number): string => (
  shiftMs ? `${name} now ${describeSubtitleShift(shiftMs)}` : `${name} back on time`
);

/** The label of the button that moves a subtitle one step: "−0.1 s" (earlier) or "+0.1 s" (later). */
export const shiftStepLabel = (direction: 1 | -1): string => (
  `${direction > 0 ? "+" : "−"}${seconds(SHIFT_STEP_MS)}`
);
