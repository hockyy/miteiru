/** Whether a key event target is a text field, where plain-key shortcuts must not fire. */
export const isTextEntryTarget = (target: EventTarget | null): boolean => (
  target instanceof HTMLElement
  && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
);
