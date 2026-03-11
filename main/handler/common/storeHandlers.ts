import {ipcMain} from "electron";
import Store from "electron-store";

const store = new Store();

export function registerStoreHandlers() {
  ipcMain.handle("electron-store-get", async (event, key, defaultValue) => {
    try {
      const value = store.get(key, defaultValue);
      console.log(`[Store] Get ${key} =`, value);
      return value;
    } catch (error) {
      console.error(`[Store] Failed to get ${key}:`, error);
      return defaultValue;
    }
  });

  ipcMain.handle("electron-store-set", async (event, key, value) => {
    try {
      console.log(`[Store] Set ${key} =`, value);
      store.set(key, value);
      console.log(`[Store] Successfully saved ${key}`);
      return true;
    } catch (error) {
      console.error(`[Store] Failed to set ${key}:`, error);
      throw error;
    }
  });
}
