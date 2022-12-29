import {app, dialog, ipcMain, protocol} from 'electron';
import serve from 'electron-serve';
import {createWindow} from './helpers';
import {requestHandler, scheme} from "./protocol";
import {
  getTags,
  kanjiAnywhere,
  kanjiBeginning,
  readingAnywhere,
  readingBeginning,
  setup as setupJmdict
} from 'jmdict-simplified-node';
import fs from "fs";
import path from "path";
import * as crypto from "crypto";


const isProd: boolean = process.env.NODE_ENV === 'production';

if (isProd) {
  serve({directory: 'app'});
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`);
}

(async () => {
  await app.whenReady();
  const appDataDirectory = app.getPath('userData');

  let JMDict = {db: null, tags: {}};
  const setUpJMDict = async (filename) => {
    try {
      if (JMDict.db) {
        JMDict.db.close()
      }
      const jmSetup = await setupJmdict(path.join(appDataDirectory, `jmdict-db`), filename);
      const jmTags = await getTags(jmSetup.db);
      JMDict = {
        db: jmSetup.db,
        tags: jmTags
      }
      return true;
    } catch (e) {
      console.log(e);

      return false;
    }
  }


  const mainWindow = createWindow('main', {
    width: 1000,
    height: 600,
  });
  ipcMain.handle('query', async (event, query) => {
    let matches = []
    try {

      matches = matches.concat(await readingBeginning(JMDict.db, query, 10));
      matches = matches.concat(await kanjiBeginning(JMDict.db, query));
      matches = matches.concat(await readingAnywhere(JMDict.db, query, 10));
      matches = matches.concat(await kanjiAnywhere(JMDict.db, query));
      const ids = matches.map(o => o.id)
      matches = matches.filter(({id}, index) => !ids.includes(id, index + 1))
      // Swap the exact match to front
      matches = matches.sort((a, b) => {
            // Get smallest kanji length in a and b, compare it
            const smallestA = (a.kanji[0].text.length)
            const smallestB = (b.kanji[0].text.length)
            if (smallestA !== smallestB) return smallestA - smallestB;
            const isVerbA = +(!JMDict.tags[a.sense[0].partOfSpeech[0]].includes("verb"));
            const isVerbB = +(!JMDict.tags[b.sense[0].partOfSpeech[0]].includes("verb"));
            if (isVerbA !== isVerbB) return isVerbA - isVerbB;
            const isNounA = +(!JMDict.tags[a.sense[0].partOfSpeech[0]].includes("noun"));
            const isNounB = +(!JMDict.tags[b.sense[0].partOfSpeech[0]].includes("noun"));
            if (isNounA !== isNounB) return isNounA - isNounB;
            if (a.kanji.length !== b.kanji.length) return a.kanji.length - b.kanji.length
          }
      )
      for (let i = 0; i < matches.length; i++) {
        if (matches[i].kanji.map(val => val.text).includes(query)) {
          [matches[i], matches[0]] = [matches[0], matches[i]]
          break;
        }
      }
      return matches
    } catch (e) {
      console.log(e)
      return []
    }
  })

  ipcMain.handle('tags', (event) => {
    return JMDict.tags;
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
  ipcMain.handle('validateConfig', async (event, config) => {
    if (!fs.existsSync(config.dicdir) || !fs.lstatSync(config.dicdir).isDirectory()) return {
      ok: false,
      message: `dicdir '${config.dicdir}' doesn't exist`
    };
    if (!fs.existsSync(config.jmdict) || !fs.lstatSync(config.jmdict).isFile()) return {
      ok: false,
      message: `jmdict '${config.jmdict}' doesn't exist`
    };
    if (!(config.jmdict.endsWith('.json'))) return {
      ok: false,
      message: `'${config.jmdict}' is not a JSON file`
    };

    const IMPORTANT_FILES = ["char.bin", "dicrc", "matrix.bin", "sys.dic", "unk.dic"]
    for (const file of IMPORTANT_FILES) {
      const currentFile = path.join(config.dicdir, file)
      if (!fs.existsSync(currentFile)) return {
        ok: false,
        message: `file '${currentFile}' doesn't exist`
      };
      if (!fs.lstatSync(currentFile).isFile()) return {
        ok: false,
        message: `'${currentFile}' is not a file`
      };
    }
    // Load DB Here
    const ret = await setUpJMDict(config.jmdict);
    if (ret) {

      return {ok: true, message: 'Setup is ready'};
    } else {
      return {
        ok: false,
        message: `Failed to load JMDict DB!`
      };
    }
  })
  ipcMain.handle('appDataPath', () => {
    return appDataDirectory
  })
  protocol.registerFileProtocol(scheme, requestHandler); /* eng-disable PROTOCOL_HANDLER_JS_CHECK */
  if (isProd) {
    await mainWindow.loadURL('app://./home.html');
  } else {
    const port = process.argv[2];
    await mainWindow.loadURL(`http://localhost:${port}/home`);
    mainWindow.webContents.openDevTools();
  }
})();

app.on('window-all-closed', () => {
  app.quit();
});
