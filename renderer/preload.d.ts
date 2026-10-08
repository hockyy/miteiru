import {IpcHandler} from '../main/preload'
import type {LiveCaptionsApiState} from "./types/liveCaptions";

interface ElectronApi {
  /** The OS Miteiru runs on; `process.platform` is not available in the renderer. */
  platform: NodeJS.Platform;
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
  getUserDataPath: () => Promise<string>;
  joinPath: (...pathSegments: string[]) => Promise<string>;
  checkFile: (filePath: string) => Promise<boolean>;
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
  }
}

export {};
