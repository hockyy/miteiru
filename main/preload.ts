import {contextBridge, ipcRenderer} from "electron";
import Store from "electron-store";

export const ElectronStore = new Store();

export const MiteiruAPI = {
  invoke: (channel, ...args) => {
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (channel, func) => {
    return ipcRenderer.on(channel, (event, ...args) => func(...args));
  },
  getPlatform: () => {
    return process.platform;
  },
  storeSet: (key, data) => {
    ElectronStore.set(key, data);
  },
  storeGet: (key, data) => {
    return ElectronStore.get(key, data);
  }
};

contextBridge.exposeInMainWorld('miteiru', MiteiruAPI);
