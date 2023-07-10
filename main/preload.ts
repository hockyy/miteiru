import {contextBridge, ipcRenderer} from "electron";
import Store from "electron-store";
import fs from "fs";
import videojs from '!video.js';
import shunou from 'shunou';
import iconv from "iconv-lite";
import wanakana from "wanakana";

export const ElectronStore = new Store();

export const MiteiruAPI = {
  invoke: (channel, ...args) => {
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (channel, func) => {
    return ipcRenderer.on(channel, (event, ...args) => func(...args));
  },
  platform: process.platform,
  storeSet: (key, data) => {
    ElectronStore.set(key, data);
  },
  storeGet: (key, data) => {
    return ElectronStore.get(key, data);
  },
  getBuffer: (path) => {
    return fs.readFileSync(path);
  },
  getDir: (path) => {
    return fs.readdirSync(path);
  },
  shunou: shunou,
  videojs: videojs,
  iconv: iconv,
  wanakana: wanakana
};

contextBridge.exposeInMainWorld('miteiru', MiteiruAPI);
