/** Suppress the browser menu without stopping word-level right-click learning actions. */
export function disableDefaultContextMenu(target: EventTarget): () => void {
  const preventMenu = (event: Event) => event.preventDefault();
  const options = {capture: true};
  target.addEventListener('contextmenu', preventMenu, options);
  return () => target.removeEventListener('contextmenu', preventMenu, options);
}
