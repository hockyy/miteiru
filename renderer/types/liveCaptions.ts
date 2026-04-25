export type LiveCaptionsState = "unsupported" | "stopped" | "starting" | "running" | "error";

export interface LiveCaptionsApiState {
  supported: boolean;
  state: LiveCaptionsState;
  running: boolean;
  latestCaption: string;
  latestError: string;
  debugMessages?: string[];
}

export const liveCaptionRefreshIntervals = [100, 250, 500, 1000] as const;

export const defaultLiveCaptionRefreshIntervalMs = 250;

export const maxLiveCaptionDebugMessages = 20;
