import {ipcMain, shell} from "electron";
import * as fsPromises from "node:fs/promises";
import {MEDIA_TOOLS_CONFIG, checkMediaTools, getMiteiruToolsPath} from "./mediaTools";

export function registerMediaToolHandlers() {
  ipcMain.handle("checkMediaTools", async (event, forceRefresh = false) => {
    return await checkMediaTools(forceRefresh);
  });


  // Opens the folder where yt-dlp and FFmpeg go, creating it first: it does not exist until needed.
  ipcMain.handle("open-tools-folder", async () => {
    const folder = getMiteiruToolsPath();
    try {
      await fsPromises.mkdir(folder, {recursive: true});
      const errorMessage = await shell.openPath(folder);
      return errorMessage ? {ok: false, error: errorMessage, path: folder} : {ok: true, path: folder};
    } catch (error) {
      return {ok: false, error: error instanceof Error ? error.message : String(error), path: folder};
    }
  });

  ipcMain.handle("getToolsConfig", async () => {
    return {
      tools: MEDIA_TOOLS_CONFIG,
      toolsPath: getMiteiruToolsPath()
    };
  });
}
