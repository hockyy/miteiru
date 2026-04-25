import {ipcMain} from "electron";

type ElectronStore = {
  get: (key: string, defaultValue?: unknown) => unknown;
  set: (key: string, value: unknown) => void;
};
let storePromise: Promise<ElectronStore> | undefined;

const getStore = async () => {
  storePromise ??= Function("specifier", "return import(specifier)")("electron-store")
    .then(({default: Store}) => new Store()) as Promise<ElectronStore>;
  return storePromise;
};

export function registerStoreHandlers() {
  ipcMain.handle("electron-store-get", async (event, key, defaultValue) => {
    try {
      const store = await getStore();
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
      const store = await getStore();
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
