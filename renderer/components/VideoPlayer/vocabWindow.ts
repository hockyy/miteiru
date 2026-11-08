/**
 * The My words panel renders only a slice of the saved words: with tens of thousands of them,
 * a card for each made opening the panel take seconds and kept hundreds of thousands of nodes
 * on the page. The slice starts around the word due nearest to now and grows as the reader
 * scrolls toward either end.
 */

/** The entries [start, end) of the sorted word list that are on the page. */
export type VocabWindow = { start: number; end: number };

/** Cards rendered around the word the panel opens on. */
export const VOCAB_WINDOW_SIZE = 120;
/** Cards added each time the reader scrolls near either end of what is rendered. */
export const VOCAB_WINDOW_STEP = 120;
/** The most cards rendered at once; growing past it drops cards from the far end. */
export const VOCAB_WINDOW_MAX = 480;

/** The window of `size` entries centred on `anchor`, kept inside a list of `length`. */
export const windowAround = (
  length: number,
  anchor: number,
  size: number = VOCAB_WINDOW_SIZE,
): VocabWindow => {
  if (length <= 0) {
    return { start: 0, end: 0 };
  }
  const at = Number.isFinite(anchor) ? Math.min(Math.max(Math.floor(anchor), 0), length - 1) : length - 1;
  const start = Math.max(0, Math.min(at - Math.floor(size / 2), length - size));
  return { start, end: Math.min(length, start + size) };
};

/** Keeps a window inside a list that may have changed length since the window was placed. */
export const clampWindow = (window: VocabWindow, length: number): VocabWindow => {
  const end = Math.min(window.end, length);
  const start = Math.min(window.start, end);
  // A list that shrank past the whole window gets a new one at its end, so cards still show.
  return end > start || length === 0 ? { start, end } : windowAround(length, length - 1);
};

/** Grows the window by `step` toward the top or the bottom, dropping entries from the other end past `max`. */
export const growWindow = (
  window: VocabWindow,
  length: number,
  direction: 'up' | 'down',
  step: number = VOCAB_WINDOW_STEP,
  max: number = VOCAB_WINDOW_MAX,
): VocabWindow => {
  const { start, end } = clampWindow(window, length);
  if (direction === 'up') {
    const nextStart = Math.max(0, start - step);
    return { start: nextStart, end: Math.min(end, nextStart + max) };
  }
  const nextEnd = Math.min(length, end + step);
  return { start: Math.max(start, nextEnd - max), end: nextEnd };
};

/** The index of the entry whose time is nearest to `now` (the first of equals), or -1 when none has a time. */
export const closestIndexByTime = (
  entries: ReadonlyArray<readonly [string, { updTime: number }]>,
  now: number,
): number => {
  let best = -1;
  let bestDiff = Infinity;
  for (let index = 0; index < entries.length; index += 1) {
    const diff = Math.abs(entries[index][1].updTime - now);
    if (diff < bestDiff) {
      best = index;
      bestDiff = diff;
    }
  }
  return best;
};
