import {dialog, ipcMain, shell} from "electron";
import * as fsPromises from "node:fs/promises";
import {access} from "node:fs/promises";
import path, {basename, dirname, extname, join} from "path";
import Japanese from "../japanese";
import Chinese from "../chinese";
import {videoConstants} from "../../../renderer/utils/constants";
import {RegisterCommonHandlersArgs} from "./types";
import {removeDictionaryStore} from "../../dictionary/levelDictionary";
import {revealAnkiImportFile} from "../../helpers/ankiImportReveal";
import {isInsideDirectory, isLyricsFilePath, isWebUrl} from "../../helpers/navigationGuard";

const isArrayEndsWithMatcher = (filePath, arrayMatcher) => {
  const lowerPath = filePath.toLowerCase();
  return arrayMatcher.some((format) => lowerPath.endsWith("." + format.toLowerCase()));
};

// Windows and macOS file systems are case-insensitive, so C:\Videos and c:\videos are one folder.
const samePath = (left: string, right: string) => (
  process.platform === "linux" ? left === right : left.toLowerCase() === right.toLowerCase()
);

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
      return await fsPromises.readFile(filePaths[0], "utf-8");
    }
    return "";
  });

  // Videos and subtitles chosen in the system file picker (the video page's Open button).
  ipcMain.handle("pick-media-files", async (): Promise<string[]> => {
    const {filePaths, canceled} = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "Videos and subtitles",
          extensions: [...videoConstants.supportedVideoFormats, ...videoConstants.supportedSubtitleFormats]
        },
        {name: "All files", extensions: ["*"]}
      ]
    });
    return canceled ? [] : filePaths;
  });

  ipcMain.handle("saveFile", async (event, allowed, saveData: string, defaultPath?: string) => {
    const {
      filePath,
      canceled
    } = await dialog.showSaveDialog({
      properties: ["createDirectory"],
      defaultPath,
      filters: [{
        name: "Allowed Extensions",
        extensions: allowed
      }]
    }).then();

    if (filePath && !canceled) {
      await fsPromises.writeFile(filePath, saveData, "utf8");
      console.info("The file has been saved!");
      return true;
    }
    return false;
  });

  ipcMain.handle("removeDictCache", async () => {
    const japSet = Japanese.getJapaneseSettings(appDataDirectory);
    const chinSet = Chinese.getMandarinSettings(appDataDirectory);
    const canSet = Chinese.getCantoneseSettings(appDataDirectory);
    // Development builds import the bundled JSON into these stores on the next language load; a
    // packaged build reads its dictionary tables directly, so there is nothing to rebuild (and the
    // stores of 7.x and early 8.x are leftovers). Learning data lives elsewhere and stays.
    await Japanese.closeDictionaries();
    await Chinese.closeDictionary();
    const cacheDirs = [japSet.dictPath, japSet.charDictPath, canSet.dictPath, chinSet.dictPath];
    await Promise.all(cacheDirs.map(removeDictionaryStore));
    return `Removed ${cacheDirs.length} dictionary caches. Packaged builds read their dictionaries directly, so there is nothing to rebuild; development builds rebuild them the next time a language loads.`;
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
      } catch {
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
      const filesMatched = (await fsPromises.readdir(folderPath))
        .map(fileName => join(folderPath, fileName))
        .filter(filePattern => isArrayEndsWithMatcher(filePattern, matcher))
        .sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: "base"}));
      filePath = path.normalize(filePath);
      const currentIndex = filesMatched.findIndex((candidate) => samePath(candidate, filePath));
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
    // Only web links: openExternal on file: or other schemes can launch programs.
    if (!isWebUrl(url)) {
      console.warn("Refusing to open a non-web URL externally:", url);
      return;
    }
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
    // The renderer only saves synced lyrics; refusing other extensions keeps a compromised page
    // from writing scripts or executables.
    if (!isLyricsFilePath(filePath)) {
      console.error("Refusing to write a non-.lrc file:", filePath);
      return false;
    }
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
      // Only Miteiru's own folders: openPath runs files (and macOS .app bundles, which are
      // folders) with their default program.
      if (!isInsideDirectory(appDataDirectory, pathToOpen) || !(await fsPromises.stat(pathToOpen)).isDirectory()) {
        return { ok: false, error: "Only Miteiru's own folders can be opened." };
      }
      const errorMessage = await shell.openPath(pathToOpen);
      if (errorMessage) {
        console.error("Error opening path:", errorMessage);
        return { ok: false, error: errorMessage };
      }
      return { ok: true };
    } catch (error) {
      console.error("Error opening path:", error);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("show-item-in-folder", async (event, filePath) => {
    try {
      await shell.showItemInFolder(filePath);
      return { ok: true };
    } catch (error) {
      console.error("Error revealing file in folder:", error);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  /** Write Anki TSV to user-data/anki, reveal in folder, and launch Anki when installed. */
  ipcMain.handle("reveal-anki-import", async (event, content: string, filename: string) => {
    return revealAnkiImportFile(appDataDirectory, content, filename);
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
