import {BrowserWindow, ipcMain} from "../../../renderer/platform/backend/shims/desktop";
import {getAiUsage, recordOpenRouterUsage, subscribeAiUsage} from "../../helpers/aiUsage";

export function registerAiUsageHandlers() {
  ipcMain.handle("ai-usage:get", () => getAiUsage());
  // Renderer-streamed learning requests report their terminal response's usage exactly once.
  // Reading a cached AI answer never calls this channel.
  ipcMain.handle("ai-usage:record", (_event, usage: unknown) => recordOpenRouterUsage(usage));
  subscribeAiUsage((summary) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.webContents.isDestroyed()) window.webContents.send("ai-usage:changed", summary);
    }
  });
}
