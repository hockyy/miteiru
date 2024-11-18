import {ipcMain} from "electron";
import Japanese from "./japanese";
import Chinese from "./chinese";

export const registerStartupHandlers = (setTokenizer, appDataDirectory) => {

  ipcMain.handle('loadKuromoji', async () => {
    setTokenizer('kuromoji');
    const error = await Japanese.setup(Japanese.getJapaneseSettings(appDataDirectory))
    return {
      ok: error ? 0 : 1,
      message: error ?? 'Setup is ready'
    }
  })

  ipcMain.handle('loadCantonese', async () => {
    setTokenizer('cantonese');
    const error = await Chinese.setup(Chinese.getCantoneseSettings(appDataDirectory))
    const error2 = await Japanese.setup(Japanese.getJapaneseSettings(appDataDirectory))

    return {
      ok: (error || error2) ? 0 : 1,
      message: (error || error2) ?? 'Setup is ready'
    }
  })
  ipcMain.handle('loadChinese', async () => {
    setTokenizer('jieba');
    const error = await Chinese.setup(Chinese.getMandarinSettings(appDataDirectory));
    const error2 = await Japanese.setup(Japanese.getJapaneseSettings(appDataDirectory))

    return {
      ok: (error || error2) ? 0 : 1,
      message: (error || error2) ?? 'Setup is ready'
    }
  })

  ipcMain.handle('loadMecab', async () => {
    setTokenizer('mecab');
    const error = await Japanese.setup(Japanese.getJapaneseSettings(appDataDirectory))
    return {
      ok: error ? 0 : 1,
      message: error ?? 'Setup is ready'
    }
  })
}