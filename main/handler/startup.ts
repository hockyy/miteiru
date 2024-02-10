import {ipcMain} from "electron";
import Japanese from "./japanese";
import Chinese from "./chinese";

export const registerStartupHandlers = (setTokenizer, appDataDirectory) => {

  ipcMain.handle('loadKuromoji', async (event) => {
    setTokenizer('kuromoji');
    const error = await Japanese.setup(Japanese.getJapaneseSettings(appDataDirectory))
    Japanese.registerKuromoji();
    Japanese.registerHandlers();
    return {
      ok: error ? 0 : 1,
      message: error ?? 'Setup is ready'
    }
  })

  ipcMain.handle('loadCantonese', async (event) => {
    setTokenizer('cantonese');
    const error = await Chinese.setup(Chinese.getCantoneseSettings(appDataDirectory))
    Chinese.registerPyCantonese();
    Chinese.registerHandlers();
    return {
      ok: error ? 0 : 1,
      message: error ?? 'Setup is ready'
    }
  })
  ipcMain.handle('loadChinese', async (event) => {
    setTokenizer('jieba');
    const error = await Chinese.setup(Chinese.getMandarinSettings(appDataDirectory));
    Chinese.registerJieba();
    Chinese.registerHandlers();
    return {
      ok: error ? 0 : 1,
      message: error ?? 'Setup is ready'
    }
  })

  ipcMain.handle('loadMecab', async (event) => {
    setTokenizer('mecab');
    const error = await Japanese.setup(Japanese.getJapaneseSettings(appDataDirectory))
    Japanese.registerHandlers();
    return {
      ok: error ? 0 : 1,
      message: error ?? 'Setup is ready'
    }
  })
}