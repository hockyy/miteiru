interface IpcHandler {
  send(channel: string, value: unknown): void;
  on(channel: string, callback: (...args: unknown[]) => void): () => void;
  invoke(channel: string, ...args: unknown[]): Promise<any>;
}
import type {LiveCaptionsApiState} from "./types/liveCaptions";

interface PlatformAPI {
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
  /** Subscribes to files dropped on the window (native paths) and to the drag hovering over it. */
  onFileDrop?: (onDrop: (paths: string[]) => void, onHover?: (hovering: boolean) => void) => () => void;
  /** Windows only: the paths of files dropped on the page, which arrive there as plain `File`s. */
  pathsForDroppedFiles?: (files: FileList) => Promise<string[]>;
  getUserDataPath: () => Promise<string>;
  joinPath: (...pathSegments: string[]) => Promise<string>;
  checkFile: (filePath: string) => Promise<boolean>;
  /** Subtitles beside a video that share its name (`ep01.srt`, `ep01.en.srt` for `ep01.mkv`). */
  checkSubtitleFile: (videoFilePath: string) => Promise<string[]>;
  /** Videos and subtitles chosen in the system file picker; empty when cancelled. */
  pickMediaFiles: () => Promise<string[]>;
  [key: string]: any;
}

declare global {
  interface Window {
    /** Set by the desktop host for MITEIRU_MUTED test launches. */
    __MITEIRU_START_MUTED__?: boolean;
    backend: IpcHandler;
    miteiruStore: any;
    miteiru: PlatformAPI;
  }
}

export {};
