import {BrowserWindow, ipcMain} from "electron";
import {onUserDictionaryChanged, userDictionary} from "../../helpers/userDictionary";

export function registerUserDictionaryHandlers() {
  onUserDictionaryChanged((change) => BrowserWindow.getAllWindows().forEach((window) => window.webContents.send("user-dictionary:changed", change)));
  const run = async (work: () => Promise<{revision: number; entries: unknown[]}>) => {
    try { return {ok: true, ...await work()}; }
    catch (error) { return {ok: false, error: error instanceof Error ? error.message : String(error)}; }
  };
  ipcMain.handle("user-dictionary:list", (_event, language?: string) => run(() => userDictionary.list(language)));
  ipcMain.handle("user-dictionary:upsert", (_event, entries: unknown[]) => run(() => userDictionary.upsert(entries)));
  ipcMain.handle("user-dictionary:delete", (_event, request: {language: string; surface: string}) => run(() => userDictionary.remove(request?.language, request?.surface)));
}
