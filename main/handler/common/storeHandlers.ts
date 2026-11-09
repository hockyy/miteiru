import {ipcMain} from "../../../renderer/platform/backend/shims/desktop";

type PlatformStore = {
  get: (key: string, defaultValue?: unknown) => unknown;
  set: (key: string, value: unknown) => void;
};
let storePromise: Promise<PlatformStore> | undefined;

/** Replaces how the store is opened; the Tauri backend worker has its own settings store. */
export const setStoreFactory = (factory: () => Promise<PlatformStore>) => {
  storePromise = factory();
};

export const getStore = async () => {
  storePromise ??= Function("specifier", "return import(specifier)")("electron-store")
    .then(({default: Store}) => new Store()) as Promise<PlatformStore>;
  return storePromise;
};

export function registerStoreHandlers() {
  ipcMain.handle("electron-store-get", async (event, key, defaultValue) => {
    try {
      const store = await getStore();
      const value = store.get(key, defaultValue);
      return value;
    } catch (error) {
      console.error(`[Store] Failed to get ${key}:`, error);
      return defaultValue;
    }
  });

  ipcMain.handle("electron-store-set", async (event, key, value) => {
    try {
      const store = await getStore();
      store.set(key, value);
      return true;
    } catch (error) {
      console.error(`[Store] Failed to set ${key}:`, error);
      throw error;
    }
  });
}
