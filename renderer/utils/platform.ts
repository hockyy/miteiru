/** Whether Miteiru runs on macOS, where shortcuts are shown with ⌘ instead of Ctrl. */
export const isMacPlatform = (): boolean =>
  typeof window !== 'undefined' && window.miteiru?.platform === 'darwin';

/** "Ctrl + Shift + H" as the user's keyboard calls it: ⌘ instead of Ctrl on macOS. */
export const formatKeys = (parts: string[], mac: boolean = isMacPlatform()): string =>
  parts.map((part) => (mac && part === 'Ctrl' ? '⌘' : part)).join(' + ');

/**
 * Whether the Ctrl modifier of a shortcut is held: Ctrl, or ⌘ on macOS (the key the labels show there).
 */
export const hasCtrlModifier = (
  event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey'>,
  mac: boolean = isMacPlatform()
): boolean => event.ctrlKey || (mac && event.metaKey);
