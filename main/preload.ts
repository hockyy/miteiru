import {contextBridge, ipcRenderer, IpcRendererEvent} from 'electron'

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
  readVideoFile: (path) => ipcRenderer.invoke('read-video-file', path),
});

contextBridge.exposeInMainWorld('shunou', {
  getFurigana: (sentence: string, mode: string) =>
      ipcRenderer.invoke('shunou-getFurigana', sentence, mode),
  processKuromojinToSeparations: (kuromojiEntries: any[]) =>
      ipcRenderer.invoke('shunou-processKuromojinToSeparations', kuromojiEntries),
});

export type IpcHandler = typeof handler