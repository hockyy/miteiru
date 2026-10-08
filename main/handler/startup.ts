import {ipcMain} from "electron";
import {loadLanguagePlugin, startupChannelPluginIds} from "./languages/registry";
import {resolveMecabCommand} from "../helpers/mecabCommand";

export type StartupChannelOptions = {
  mecabPath?: string;
};

export const registerStartupHandlers = (
  setTokenizer,
  appDataDirectory,
  setMecabCommand: (command: string) => void = () => {}
) => {
  Object.entries(startupChannelPluginIds).forEach(([channel, pluginId]) => {
    ipcMain.handle(channel, async (_event, options: StartupChannelOptions = {}) => {
      if (channel === "loadMecab") {
        setMecabCommand(resolveMecabCommand(options?.mecabPath));
      }
      return loadLanguagePlugin(pluginId, {
        appDataDirectory,
        setTokenizer
      });
    });
  });
}
