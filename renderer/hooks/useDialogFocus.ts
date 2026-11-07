import {RefObject, useEffect, useRef} from 'react';
import {FOCUSABLE_SELECTOR, isTopDialog, nextTabIndex, registerDialog} from '../utils/dialogFocus';

type Options = {
  /** Whether the dialog is showing. Default true (for dialogs that are mounted only while open). */
  active?: boolean;
  /** Esc closes the dialog. Leave it off where something else already handles Esc. */
  onEscape?: () => void;
};

/**
 * Dialog focus: moves focus into the dialog when it opens, keeps Tab inside it, closes it on Esc
 * (the newest open dialog only), and puts focus back where it was when it closes.
 * Give the dialog element `tabIndex={-1}` so it can take focus itself.
 */
export const useDialogFocus = (ref: RefObject<HTMLElement | null>, {active = true, onEscape}: Options = {}) => {
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;

  useEffect(() => {
    const dialog = ref.current;
    if (!active || !dialog) return;
    const id = Symbol('dialog');
    const unregister = registerDialog(id);
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.contains(document.activeElement)) dialog.focus({preventScroll: true});

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopDialog(id)) return;
      if (event.code === 'Escape' && escapeRef.current) {
        event.stopPropagation();
        escapeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      const target = nextTabIndex(items.length, items.indexOf(document.activeElement as HTMLElement), event.shiftKey);
      if (target === null) {
        // Focus is on the dialog itself with nothing to tab to: stay put.
        if (items.length === 0) event.preventDefault();
        return;
      }
      event.preventDefault();
      items[target].focus();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      unregister();
      if (previous && previous.isConnected) previous.focus({preventScroll: true});
    };
  }, [ref, active]);
};
