import {ipcMain} from "electron";
import {MEDIA_TOOLS_CONFIG, checkMediaTools, getMiteiruToolsPath} from "./mediaTools";

export function registerMediaToolHandlers() {
  ipcMain.handle("checkMediaTools", async (event, forceRefresh = false) => {
    return await checkMediaTools(forceRefresh);
  });


  ipcMain.handle("getToolsConfig", async () => {
    return {
      tools: MEDIA_TOOLS_CONFIG,
      toolsPath: getMiteiruToolsPath()
    };
  });
}
