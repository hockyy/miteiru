import {contextBridge, ipcRenderer, IpcRendererEvent} from 'electron'
import {webUtils} from "electron";

const handler = {
  send(channel: string, value: unknown) {
    ipcRenderer.send(channel, value)
  },
  on(channel: string, callback: (...args: unknown[]) => void) {
    const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
        callback(...args)
    ipcRenderer.on(channel, subscription)

    return () => {
      ipcRenderer.removeListener(channel, subscription)
    }
  },
  invoke(channel: string, ...args: unknown[]) {
    return ipcRenderer.invoke(channel, ...args)
  }
}

contextBridge.exposeInMainWorld('electronStore', {
  get: (key, defaultValue) => ipcRenderer.invoke('electron-store-get', key, defaultValue),
  set: (key, value) => ipcRenderer.invoke('electron-store-set', key, value),
});

contextBridge.exposeInMainWorld('ipc', handler)

contextBridge.exposeInMainWorld('electronAPI', {
  getPath: (file) => {
    return webUtils.getPathForFile(file);
  },
  googleTranslate: (text: string, lang: string) => ipcRenderer.invoke('gtrans', text, lang),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  checkSubtitleFile: (videoFilePath: string) =>
      ipcRenderer.invoke('check-subtitle-file', videoFilePath),
  fs: {
    readFile: (filename: string) => ipcRenderer.invoke('fs-readFile', filename),
    writeFile: (filename: string, data: string) => ipcRenderer.invoke('fs-writeFile', filename, data),
  },
  parseSubtitle: (filename: string) => ipcRenderer.invoke('parse-subtitle', filename),
  findPositionDeltaInFolder: (path: string, delta: number = 1) =>
      ipcRenderer.invoke('find-position-delta-in-folder', path, delta),

  // Media analysis and embedded content
  analyzeMediaFile: (filePath: string) => ipcRenderer.invoke('analyze-media-file', filePath),
  extractEmbeddedSubtitle: (inputPath: string, trackIndex: number, outputFormat: string) => 
    ipcRenderer.invoke('extract-embedded-subtitle', inputPath, trackIndex, outputFormat),
  cleanupTempSubtitle: (filePath: string) => ipcRenderer.invoke('cleanup-temp-subtitle', filePath),

  // Add these new methods for LRCLIB support
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
  joinPath: (...pathSegments: string[]) => ipcRenderer.invoke('join-path', ...pathSegments),
  getDirname: (filePath: string) => ipcRenderer.invoke('get-dirname', filePath),
  getBasename: (filePath: string) => ipcRenderer.invoke('get-basename', filePath),
  ensureDir: (dirPath: string) => ipcRenderer.invoke('ensure-dir', dirPath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('write-file', filePath, content),
  openPath: (pathToOpen: string) => ipcRenderer.invoke('open-path', pathToOpen),
  checkFile: (filePath: string) => ipcRenderer.invoke('check-file', filePath),

  // Update the Gist-related methods to include the token
  createGitHubGist: (filename: string, content: string, description: string, isPublic: boolean, token: string) =>
      ipcRenderer.invoke('createGitHubGist', filename, content, description, isPublic, token),
  loadGitHubGists: (username: string, token: string, perPage: number = 30, page: number = 1) =>
      ipcRenderer.invoke('loadGitHubGists', username, token, perPage, page),
  getGitHubGistContent: (gistId: string, token: string) =>
      ipcRenderer.invoke('getGitHubGistContent', gistId, token),
});

contextBridge.exposeInMainWorld('shunou', {
  getFurigana: (sentence: string, mode: string) =>
      ipcRenderer.invoke('shunou-getFurigana', sentence, mode),
  processKuromojinToSeparations: (kuromojiEntries: any[]) =>
      ipcRenderer.invoke('shunou-processKuromojinToSeparations', kuromojiEntries),
});

export type IpcHandler = typeof handler