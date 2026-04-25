import {IpcHandler} from '../main/preload'

type LiveCaptionsState = "unsupported" | "stopped" | "starting" | "running" | "error";

interface LiveCaptionsApiState {
  supported: boolean;
  state: LiveCaptionsState;
  running: boolean;
  latestCaption: string;
  latestError: string;
  debugMessages?: string[];
}

interface ElectronApi {
  liveCaptions: {
    isSupported: () => Promise<boolean>;
    getState: () => Promise<LiveCaptionsApiState>;
    start: () => Promise<LiveCaptionsApiState>;
    stop: () => Promise<LiveCaptionsApiState>;
    onCaption: (callback: (caption: string) => void) => () => void;
    onState: (callback: (state: LiveCaptionsApiState) => void) => () => void;
    onError: (callback: (error: string) => void) => () => void;
    onDebug: (callback: (message: string) => void) => () => void;
  };
  [key: string]: any;
}

declare global {
  interface Window {
    ipc: IpcHandler;
    electronStore: any;
    electronAPI: ElectronApi;
    shunou: any;
  }
}
