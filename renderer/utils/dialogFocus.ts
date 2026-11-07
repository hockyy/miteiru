/**
 * Where Tab goes inside a dialog, so focus never leaves it.
 * `current` is the index of the focused control, or -1 when focus is on the dialog itself or outside it.
 * Returns the index to focus, or null to let the browser move focus on its own.
 */
export const nextTabIndex = (count: number, current: number, backwards: boolean): number | null => {
  if (count <= 0) return null;
  if (current < 0) return backwards ? count - 1 : 0;
  if (backwards) return current === 0 ? count - 1 : null;
  return current === count - 1 ? 0 : null;
};

/** Open dialogs, newest last: only the newest answers Esc, so one Esc never closes two. */
const openDialogs: symbol[] = [];

export const registerDialog = (id: symbol): (() => void) => {
  openDialogs.push(id);
  return () => {
    const index = openDialogs.indexOf(id);
    if (index >= 0) openDialogs.splice(index, 1);
  };
};

export const isTopDialog = (id: symbol): boolean => openDialogs[openDialogs.length - 1] === id;

export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');
