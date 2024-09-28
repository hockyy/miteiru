import {IpcHandler} from '../main/preload'

interface ElectronStore {
  get: (key: string, defaultValue?: any) => Promise<any>;
  set: (key: string, value: any) => Promise<void>;
}

interface ElectronAPI {
  openExternal: (url: string) => Promise<void>;
  googleTranslate: (text: string, lang: string) => Promise<any>;
  checkSubtitleFile: (videoFilePath: string) => Promise<string[] | null>;
  fs: {
    readFile: (filename: string) => Promise<string>;
    writeFile: (filename: string, data: string) => Promise<boolean>;
  };
  parseSubtitle: (filename: string) => Promise<any>;
  findPositionDeltaInFolder: (path: string, delta?: number) => Promise<string>;
  createGitHubGist: (filename: string, content: string, description: string, isPublic: boolean, token: string) => Promise<any>;
  loadGitHubGists: (username: string, token: string, perPage?: number, page?: number) => Promise<any>;
  getGitHubGistContent: (gistId: string, token: string) => Promise<any>;
}

interface Shunou {
  getFurigana: (sentence: string, mode: string) => Promise<any>;
  processKuromojinToSeparations: (kuromojiEntries: any[]) => Promise<any>;
}

declare global {
  interface Window {
    ipc: IpcHandler;
    electronStore: ElectronStore;
    electronAPI: ElectronAPI;
    shunou: Shunou;
  }
}
