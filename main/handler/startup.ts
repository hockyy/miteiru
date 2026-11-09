import {ipcMain} from "../../renderer/platform/backend/shims/desktop";
import {loadLanguagePlugin, startupChannelPluginIds} from "./languages/registry";

export const registerStartupHandlers = (setTokenizer, appDataDirectory) => {
  Object.entries(startupChannelPluginIds).forEach(([channel, pluginId]) => {
    ipcMain.handle(channel, async () => {
      return loadLanguagePlugin(pluginId, {
        appDataDirectory,
        setTokenizer
      });
    });
  });
}
