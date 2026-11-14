import {BrowserWindow} from "../../renderer/platform/backend/shims/desktop";
import type {OpenVideoRequest} from "./tools";

/**
 * The worker can't drive the UI, so an assistant's "open this video" waits here as one pending
 * request while the window is nudged. The video page takes it (`assistant:take-open-request`), which
 * is what opens the video and tells the assistant it worked. A learner who would lose typed text
 * when the page changes may turn it down (`assistant:decline-open-request`).
 */

export const OPEN_VIDEO_EVENT = "assistant:open-video";

/**
 * What happened to a request: the window took it, the learner turned it down, a newer request took its
 * place (so it never opens), or nothing yet.
 */
export type OpenOutcome = "opened" | "declined" | "replaced" | "waiting";

/** How long a request can still be taken: a window that is busy or on another page gets a minute. */
const REQUEST_LIFETIME_MS = 60_000;
const DEFAULT_WAIT_MS = 20_000;

interface PendingRequest {
  request: OpenVideoRequest;
  resolve: (outcome: OpenOutcome) => void;
  timers: ReturnType<typeof setTimeout>[];
}

let pending: PendingRequest | null = null;

const settle = (entry: PendingRequest, outcome: OpenOutcome) => {
  entry.timers.forEach(clearTimeout);
  entry.resolve(outcome);
};

/**
 * Asks Miteiru's window to open a video. Resolves when the window takes the request or the learner
 * turns it down, or "waiting" after `waitMs`; a request still pending then stays takeable until its
 * minute is up. A newer request replaces an older one, which resolves "replaced".
 */
export const requestOpenVideo = (request: OpenVideoRequest, waitMs = DEFAULT_WAIT_MS): Promise<OpenOutcome> => (
  new Promise<OpenOutcome>((resolve) => {
    if (pending) settle(pending, "replaced");
    const entry: PendingRequest = {request, resolve, timers: []};
    entry.timers.push(
      setTimeout(() => resolve("waiting"), waitMs),
      setTimeout(() => {
        if (pending === entry) pending = null;
        resolve("waiting");
      }, REQUEST_LIFETIME_MS)
    );
    pending = entry;
    BrowserWindow.getAllWindows().forEach((window) => window.webContents.send(OPEN_VIDEO_EVENT));
  })
);

/** The pending request, marked taken; null when there is none or it ran out. */
export const takeOpenRequest = (): OpenVideoRequest | null => {
  if (!pending) return null;
  const entry = pending;
  pending = null;
  settle(entry, "opened");
  return entry.request;
};

/** Drops the pending request because the learner turned it down, so it can't open later on its own. */
export const declineOpenRequest = (): boolean => {
  if (!pending) return false;
  const entry = pending;
  pending = null;
  settle(entry, "declined");
  return true;
};
