/**
 * How the My words panel (VocabSidebar) keeps what is on screen in place while its window of cards
 * changes above the visible area. Chromium does this by itself (CSS scroll anchoring), but the
 * webviews on macOS (WKWebView) and Linux (WebKitGTK) don't, so the panel turns the browser's
 * anchoring off and holds a card by hand everywhere. The app's self-test (platform/smokeTest.ts)
 * checks this on each OS's webview.
 */

/** How far past the visible part of the panel a rendered end counts as near, so cards are added in time. */
export const VOCAB_EDGE_MARGIN = '800px 0px';

/** An element's top edge, in px below the top of a scroll container's visible area. */
export const topWithin = (container: HTMLElement, element: HTMLElement) =>
  element.getBoundingClientRect().top - container.getBoundingClientRect().top;

/** Scrolls `container` so that `element` is back at `previousTop` (from topWithin, before the change). */
export const holdScrollPosition = (container: HTMLElement, element: HTMLElement, previousTop: number) => {
  container.scrollTop += topWithin(container, element) - previousTop;
};

/**
 * The index of the first card whose bottom edge is below `viewTop`, i.e. the card at the top of the
 * visible area (`count` when every card is above it). Cards are in order, so this is a binary search
 * and a scroll event measures only a few of them.
 */
export const firstVisibleIndex = (count: number, bottomOf: (index: number) => number, viewTop: number): number => {
  let low = 0;
  let high = count;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (bottomOf(middle) > viewTop) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return low;
};
