import {contextBridge, ipcRenderer} from "electron";
import * as electron from "electron";
import {ElectronStore} from "./background";


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
