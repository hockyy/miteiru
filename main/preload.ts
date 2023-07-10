import {contextBridge, ipcRenderer} from "electron";


export const MiteiruAPI = {
  invoke: (channel, ...args) => {
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (channel, func) => {
    return ipcRenderer.on(channel, (event, ...args) => func(...args));
  },
  getPlatform: () => {
    return process.platform;
  }
};

contextBridge.exposeInMainWorld('miteiru', MiteiruAPI);
