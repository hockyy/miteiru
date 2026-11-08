const NON_TEXT_INPUTS = new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit']);

const isEditable = (target: EventTarget | null): boolean => {
  const element = (target as Element | null)?.closest ? target as Element : (target as Node | null)?.parentElement;
  if (!element?.closest) return false;
  const field = element.closest('input, textarea, select, [contenteditable]');
  if (!field) return false;
  const tag = field.tagName.toLowerCase();
  if (tag === 'input') return !NON_TEXT_INPUTS.has(((field as HTMLInputElement).type || 'text').toLowerCase());
  if (tag === 'textarea' || tag === 'select') return true;
  return field.getAttribute('contenteditable')?.toLowerCase() !== 'false';
};

const hasTextSelection = () => Boolean(globalThis.getSelection?.()?.toString());

/**
 * Suppress the browser's right-click menu, except in text fields (Paste, Copy) and over a text
 * selection (Copy). It never stops propagation: subtitle words handle right-click themselves.
 */
export function disableDefaultContextMenu(target: EventTarget): () => void {
  const preventMenu = (event: Event) => {
    if (isEditable(event.target) || hasTextSelection()) return;
    event.preventDefault();
  };
  const options = {capture: true};
  target.addEventListener('contextmenu', preventMenu, options);
  return () => target.removeEventListener('contextmenu', preventMenu, options);
}
