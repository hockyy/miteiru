import {Easing, interpolate, spring} from "remotion";

// The beat grid the music was written to: 150 BPM at 60 fps.
export const FPS = 60;
export const BEAT = 24;
export const BAR = 96;
export const W = 1920;
export const H = 1080;
export const TOTAL = 2160;
/** First frame of `bar` (1-indexed), plus `beat` beats (may be fractional). */
export const at = (bar: number, beat = 0) => (bar - 1) * BAR + Math.round(beat * BEAT);

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const expoOut = Easing.bezier(0.16, 1, 0.3, 1);
export const expoIn = Easing.bezier(0.7, 0, 0.84, 0);
export const expoInOut = Easing.bezier(0.87, 0, 0.13, 1);
export const backOut = Easing.bezier(0.34, 1.56, 0.64, 1);

/** 0→1 over `dur` frames from `start`, eased. */
export const prog = (frame: number, start: number, dur: number, ease: (t: number) => number = expoOut) =>
  ease(clamp01((frame - start) / dur));

/** A spring that starts at `start` (0 before). */
export const pop = (frame: number, start: number, opts: {damping?: number; stiffness?: number; mass?: number} = {}) =>
  frame < start ? 0 : spring({frame: frame - start, fps: FPS, config: {damping: opts.damping ?? 12, stiffness: opts.stiffness ?? 170, mass: opts.mass ?? 0.7}});

/** A short scale kick on every beat between `from` and `to` (decays within the beat). */
export const beatPunch = (frame: number, from: number, to: number, amount = 0.035, every = BEAT) => {
  if (frame < from || frame >= to) return 1;
  const t = (frame - from) % every;
  return 1 + amount * Math.exp(-t / 4);
};

/** Camera shake that decays from `start` over `dur` frames. */
export const shake = (frame: number, start: number, dur = 18, amp = 18) => {
  if (frame < start || frame > start + dur) return {x: 0, y: 0, r: 0};
  const k = 1 - (frame - start) / dur;
  const t = frame - start;
  return {
    x: Math.sin(t * 2.7) * amp * k * k,
    y: Math.cos(t * 3.3) * amp * 0.7 * k * k,
    r: Math.sin(t * 1.9) * 0.6 * k * k,
  };
};

export const lerp = (frame: number, input: number[], output: number[], ease: (t: number) => number = expoOut) =>
  interpolate(frame, input, output, {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease});

export const C = {
  navy: "#0f1e4a",
  ink: "#172554",
  blue: "#2563eb",
  blue5: "#3b82f6",
  sky: "#7dd3fc",
  sky2: "#bae6fd",
  paper: "#f4f8ff",
  yellow: "#fde047",
  butter: "#fef9c3",
  pink: "#f9a8d4",
  red: "#dc2626",
  green: "#22c55e",
  white: "#ffffff",
};
