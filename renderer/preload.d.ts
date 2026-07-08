import {IpcHandler} from '../main/preload'
import type {LiveCaptionsApiState} from "./types/liveCaptions";

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
  /** Electron adds a filesystem path to dragged/dropped File objects. */
  interface File {
    readonly path?: string;
  }

  interface Window {
    ipc: IpcHandler;
    electronStore: any;
    electronAPI: ElectronApi;
    miteiruJapanese: any;
  }
}

export {};
