import {dialog, ipcMain} from "electron";
import {getSubtitles} from "../helpers/getSubtitles";
import fs from "fs";
import Japanese from "./japanese";

export const registerCommonHandlers = (getTokenizer, packageJson) => {
  ipcMain.handle('getYoutubeSubtitle', async (event, videoID, lang) => {
    // Fetching Subtitles
    try {
      return await getSubtitles({videoID, lang})
    } catch (error) {
      console.error('Error fetching subtitles:', error);
      return []
    }
  })
  ipcMain.handle('pickDirectory', async (event) => {
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
      filters: [{name: 'Allowed Extensions', extensions: allowed}]
    });
  })

  ipcMain.handle('readFile', async (event, allowed) => {
    const {filePaths, canceled} = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{name: 'Allowed Extensions', extensions: allowed}]
    });
    if (filePaths.length > 0 && !canceled) {
      return fs.readFileSync(filePaths[0], 'utf-8');
    }
    return '';
  })

  ipcMain.handle('saveFile', async (event, allowed, saveData: string) => {
    const {filePath, canceled} = await dialog.showSaveDialog({
      properties: ['createDirectory'],
      filters: [{name: 'Allowed Extensions', extensions: allowed}]
    }).then()

    if (filePath && !canceled) {
      fs.writeFile(filePath, saveData, (err) => {
        if (err) throw err;
        console.info('The file has been saved!');
      });
    }


  })


  ipcMain.handle('removeDictCache', (event) => {
    return true;
  })

  ipcMain.handle('getTokenizerMode', async () => {
    return getTokenizer();
  })
  ipcMain.handle('getAppVersion', async () => {
    return packageJson.version;
  });
}