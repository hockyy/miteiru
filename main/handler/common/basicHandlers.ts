import {dialog, ipcMain, shell} from "electron";
import fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import {access} from "node:fs/promises";
import path, {basename, dirname, extname, join} from "path";
import Japanese from "../japanese";
import Chinese from "../chinese";
import Vietnamese from "../vietnamese";
import {videoConstants} from "../../../renderer/utils/constants";
import {RegisterCommonHandlersArgs} from "./types";

const isArrayEndsWithMatcher = (filePath, arrayMatcher) => {
  for (const videoFormat of arrayMatcher) {
    if (filePath.endsWith("." + videoFormat)) {
      return true;
    }
  }
  return false;
};

const isVideo = (filePath) => {
  return isArrayEndsWithMatcher(filePath, videoConstants.supportedVideoFormats);
};

const isSubtitle = (filePath) => {
  return isArrayEndsWithMatcher(filePath, videoConstants.supportedSubtitleFormats);
};

export function registerBasicHandlers({
  getTokenizer,
  packageJson,
  appDataDirectory
}: RegisterCommonHandlersArgs) {
  ipcMain.handle("pickDirectory", async () => {
    return await dialog.showOpenDialog({
      properties: ["openDirectory"]
    });
  });

  ipcMain.handle("pickFile", async (event, allowed) => {
    return await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{
        name: "Allowed Extensions",
        extensions: allowed
      }]
    });
  });

  ipcMain.handle("readFile", async (event, allowed) => {
    const {
      filePaths,
      canceled
    } = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{
        name: "Allowed Extensions",
        extensions: allowed
      }]
    });
    if (filePaths.length > 0 && !canceled) {
      return fs.readFileSync(filePaths[0], "utf-8");
    }
    return "";
  });

  ipcMain.handle("saveFile", async (event, allowed, saveData: string) => {
    const {
      filePath,
      canceled
    } = await dialog.showSaveDialog({
      properties: ["createDirectory"],
      filters: [{
        name: "Allowed Extensions",
        extensions: allowed
      }]
    }).then();

    if (filePath && !canceled) {
      fs.writeFile(filePath, saveData, (err) => {
        if (err) throw err;
        console.info("The file has been saved!");
      });
    }
  });

  ipcMain.handle("removeDictCache", () => {
    const japSet = Japanese.getJapaneseSettings(appDataDirectory);
    const chinSet = Chinese.getMandarinSettings(appDataDirectory);
    const canSet = Chinese.getCantoneseSettings(appDataDirectory);
    const vietSet = Vietnamese.getVietnameseSettings(appDataDirectory);
    return `rm -rf "${japSet.dictPath}"; rm -rf "${japSet.charDictPath}"; rm -rf "${canSet.dictPath}"; rm -rf "${chinSet.dictPath}"; rm -rf "${vietSet.dictPath}"`;
  });

  ipcMain.handle("getTokenizerMode", async () => {
    return getTokenizer();
  });

  ipcMain.handle("getAppVersion", async () => {
    return packageJson.version;
  });

  ipcMain.handle("check-subtitle-file", async (event, videoFilePath) => {
    const videoFileName = basename(videoFilePath, extname(videoFilePath));
    const videoDirectory = dirname(videoFilePath);
    const subtitleExtensions = [...videoConstants.supportedSubtitleFormats];
    for (const ext of videoConstants.supportedSubtitleFormats) {
      subtitleExtensions.push("en." + ext);
    }
    const availableSubs = [];
    for (const ext of subtitleExtensions) {
      const subtitleFilePath = join(videoDirectory, videoFileName + "." + ext);
      try {
        await access(subtitleFilePath);
        availableSubs.push(subtitleFilePath);
      } catch (error) {
        // Subtitle file does not exist, continue to the next extension
      }
    }
    return availableSubs;
  });

  ipcMain.handle("find-position-delta-in-folder", async (event, filePath, delta = 1) => {
    if (process.platform === "win32" && filePath.charAt(0) === "/") {
      filePath = filePath.substring(1);
    }

    const matcher = isVideo(filePath) ? videoConstants.supportedVideoFormats :
      isSubtitle(filePath) ? videoConstants.supportedSubtitleFormats :
        [];

    const folderPath = dirname(filePath);

    try {
      const filesMatched = fs.readdirSync(folderPath)
        .map(fileName => join(folderPath, fileName))
        .filter(filePattern => isArrayEndsWithMatcher(filePattern, matcher))
        .sort();
      filePath = path.normalize(filePath);
      const currentIndex = filesMatched.indexOf(filePath);
      if (currentIndex === -1) {
        if (delta < 0) delta++;
      }

      const nextIndex = currentIndex + delta;
      if (nextIndex >= 0 && nextIndex < filesMatched.length) {
        return filesMatched[nextIndex];
      }

      return "";
    } catch (error) {
      console.error("Error reading directory:", error);
      return "";
    }
  });

  ipcMain.handle("open-external", async (event, url) => {
    await shell.openExternal(url);
  });

  ipcMain.handle("get-user-data-path", () => {
    return appDataDirectory;
  });

  ipcMain.handle("join-path", (event, ...pathSegments) => {
    return path.join(...pathSegments);
  });

  ipcMain.handle("get-dirname", (event, filePath) => {
    return path.dirname(filePath);
  });

  ipcMain.handle("get-basename", (event, filePath) => {
    return path.basename(filePath);
  });

  ipcMain.handle("ensure-dir", async (event, dirPath) => {
    try {
      await fsPromises.mkdir(dirPath, {recursive: true});
      return true;
    } catch (error) {
      console.error("Error creating directory:", error);
      return false;
    }
  });

  ipcMain.handle("write-file", async (event, filePath, content) => {
    try {
      await fsPromises.writeFile(filePath, content, "utf8");
      return true;
    } catch (error) {
      console.error("Error writing file:", error);
      return false;
    }
  });

  ipcMain.handle("open-path", async (event, pathToOpen) => {
    try {
      await shell.openPath(pathToOpen);
      return true;
    } catch (error) {
      console.error("Error opening path:", error);
      return false;
    }
  });

  ipcMain.handle("check-file", async (event, filePath) => {
    try {
      await fsPromises.access(filePath);
      return true;
    } catch {
      return false;
    }
  });
}
