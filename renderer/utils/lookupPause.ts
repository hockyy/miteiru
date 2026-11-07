export type LookupPauseInput = {
  /** Whether the meaning popup is open now. */
  open: boolean;
  /** Whether it was open the last time this ran. */
  wasOpen: boolean;
  /** Whether the video is playing right now. */
  playing: boolean;
  /** The "Pause while I look up words" setting. */
  enabled: boolean;
  /** Whether Miteiru paused the video for the popup that is (or was) open. */
  pausedByUs: boolean;
};

export type LookupPauseResult = {
  pause: boolean;
  resume: boolean;
  pausedByUs: boolean;
};

/**
 * What to do with the video when the word popup opens or closes. It pauses a playing video as the
 * popup opens, and resumes it when the popup closes, but only if Miteiru paused it: a video the
 * learner had already paused stays paused.
 */
export const lookupPauseStep = ({open, wasOpen, playing, enabled, pausedByUs}: LookupPauseInput): LookupPauseResult => {
  if (open && !wasOpen) {
    const pause = enabled && playing;
    return {pause, resume: false, pausedByUs: pause};
  }
  if (!open && wasOpen) {
    return {pause: false, resume: pausedByUs, pausedByUs: false};
  }
  // Still open, still closed: a video the learner starts again by hand is theirs to pause again.
  if (open && pausedByUs && playing) return {pause: false, resume: false, pausedByUs: false};
  return {pause: false, resume: false, pausedByUs};
};
