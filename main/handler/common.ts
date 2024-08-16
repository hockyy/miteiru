import {dialog, ipcMain} from "electron";
import {getSubtitles} from "../helpers/getSubtitles";
import fs from "node:fs";
import * as fsPromises from 'node:fs/promises';
import {access} from 'node:fs/promises';
import Japanese from "./japanese";
import Chinese from "./chinese";
import Store from 'electron-store';
import {basename, dirname, extname, join} from 'path';
import {parse as parseSRT} from '@plussub/srt-vtt-parser';
import languageEncoding from "detect-file-encoding-and-language";
import iconv from "iconv-lite"
import {videoConstants} from "../../renderer/utils/constants";

const store = new Store();
const isArrayEndsWithMatcher = (path, arrayMatcher) => {
  for (const videoFormat of arrayMatcher) {
    if (path.endsWith('.' + videoFormat)) {
      return true
    }
  }
  return false;
}

const isVideo = (path) => {
  return isArrayEndsWithMatcher(path, videoConstants.supportedVideoFormats);
}
const isSubtitle = (path) => {
  return isArrayEndsWithMatcher(path, videoConstants.supportedSubtitleFormats);
}

export const registerCommonHandlers = (getTokenizer, packageJson, appDataDirectory) => {

  ipcMain.handle('electron-store-get', async (event, key, defaultValue) => {
    return store.get(key, defaultValue);
  });

  ipcMain.handle('electron-store-set', async (event, key, value) => {
    store.set(key, value);
  });

// Rest of your main process code
  ipcMain.handle('getYoutubeSubtitle', async (event, videoID, lang) => {
    // Fetching Subtitles
    try {
      return await getSubtitles({
        videoID,
        lang
      })
    } catch (error) {
      console.error('Error fetching subtitles:', error);
      return []
    }
  })
  ipcMain.handle('pickDirectory', async () => {
    return await dialog.showOpenDialog({
      properties:
          [
            // 'openFile',
            // 'multiSelections',
            'openDirectory'
          ],
      // filters: [
      //   {name: 'Images', extensions: ['jpg', 'png', 'gif']},
      //   {name: 'Movies', extensions: ['mkv', 'avi', 'mp4']},
      //   {name: 'Custom File Type', extensions: ['as']},
      //   {name: 'All Files', extensions: ['*']}
      // ]
    });
  })
  ipcMain.handle('pickFile', async (event, allowed) => {
    return await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{
        name: 'Allowed Extensions',
        extensions: allowed
      }]
    });
  })

  ipcMain.handle('readFile', async (event, allowed) => {
    const {
      filePaths,
      canceled
    } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{
        name: 'Allowed Extensions',
        extensions: allowed
      }]
    });
    if (filePaths.length > 0 && !canceled) {
      return fs.readFileSync(filePaths[0], 'utf-8');
    }
    return '';
  })

  ipcMain.handle('saveFile', async (event, allowed, saveData: string) => {
    const {
      filePath,
      canceled
    } = await dialog.showSaveDialog({
      properties: ['createDirectory'],
      filters: [{
        name: 'Allowed Extensions',
        extensions: allowed
      }]
    }).then()

    if (filePath && !canceled) {
      fs.writeFile(filePath, saveData, (err) => {
        if (err) throw err;
        console.info('The file has been saved!');
      });
    }
  })


  ipcMain.handle('removeDictCache', () => {
    const japSet = Japanese.getJapaneseSettings(appDataDirectory);
    const chinSet = Chinese.getMandarinSettings(appDataDirectory);
    const canSet = Chinese.getCantoneseSettings(appDataDirectory);
    return `rm -rf "${japSet.dictPath}"; rm -rf "${japSet.charDictPath}"; rm -rf "${canSet.dictPath}", rm -rf "${chinSet.dictPath}"`
  })

  ipcMain.handle('getTokenizerMode', async () => {
    return getTokenizer();
  })
  ipcMain.handle('getAppVersion', async () => {
    return packageJson.version;
  });


  ipcMain.handle('check-subtitle-file', async (event, videoFilePath) => {
    const videoFileName = basename(videoFilePath, extname(videoFilePath));
    const videoDirectory = dirname(videoFilePath);
    const subtitleExtensions = ['.srt', '.ass'];

    for (const ext of subtitleExtensions) {
      const subtitleFilePath = join(videoDirectory, videoFileName + ext);
      try {
        await access(subtitleFilePath);
        return subtitleFilePath;
      } catch (error) {
        // Subtitle file does not exist, continue to the next extension
      }
    }

    return null; // No subtitle file found
  });


  ipcMain.handle('fs-readFile', async (event, filename) => {
    try {
      const buffer = await fsPromises.readFile(filename);
      return buffer.toString('base64'); // Send as base64 string
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle('fs-writeFile', async (event, filename, data) => {
    try {
      await fsPromises.writeFile(filename, Buffer.from(data, 'base64'));
      return true;
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle('parse-subtitle', async (event, filename) => {
    try {
      const buffer = await fsPromises.readFile(filename);
      const blob = new Blob([buffer]);
      const currentData = await languageEncoding(blob);
      const text = iconv.decode(buffer, currentData.encoding);

      if (filename.toLowerCase().endsWith('.ass')) {
        // For ASS files, just return the text content
        return {
          type: 'ass',
          content: text
        };
      } else {
        // For SRT files, parse and return the result
        return {
          type: 'srt',
          content: parseSRT(text)
        };
      }
    } catch (error) {
      throw error;
    }
  });


  ipcMain.handle('find-position-delta-in-folder', async (event, filePath, delta = 1) => {
    if (process.platform === 'win32' && filePath.charAt(0) === '/') {
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

      const currentIndex = filesMatched.indexOf(filePath);
      if (currentIndex === -1) {
        if (delta < 0) delta++;
      }

      const nextIndex = currentIndex + delta;
      if (nextIndex >= 0 && nextIndex < filesMatched.length) {
        return filesMatched[nextIndex];
      }

      return '';
    } catch (error) {
      console.error('Error reading directory:', error);
      return '';
    }
  });

}