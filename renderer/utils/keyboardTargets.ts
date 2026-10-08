// <input> types that take typed text; range sliders, checkboxes and buttons do not.
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number']);

/** Whether a key event target is a text field, where plain-key shortcuts must not fire. */
export const isTextEntryTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(target.type);
  return target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
};
