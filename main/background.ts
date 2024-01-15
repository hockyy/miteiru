import {app, dialog, ipcMain, protocol} from 'electron';
import serve from 'electron-serve';
import {createWindow} from './helpers';
import {requestHandler, scheme} from "./protocol";
import {getTags, kanjiBeginning, readingBeginning, setup as setupJmdict} from 'jmdict-wrapper';

import {search as searchKanji, setup as setupKanjidic} from 'kanjidic-wrapper';

import {charAnywhere, charBeginning, hanzi, setup as setupChinese} from 'cc-chinese-wrapper';
import fs from "fs";
import path from "path";
import {getTokenizer} from "kuromojin";
import {getSubtitles} from "./helpers/getSubtitles";
import {PythonShell} from "python-shell";


const isProd: boolean = process.env.NODE_ENV === 'production';

if (isProd) {
  serve({directory: 'app'});
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`);
}

(async () => {
  await app.whenReady();
  const appDataDirectory = app.getPath('userData');
  const cantoneseScriptFilePath = path.join(__dirname, `cantonese/cantonese.py`);
  const cantoneseScriptAppDataPath = path.join(appDataDirectory, 'cantonese.py')
  const chineseScriptFilePath = path.join(__dirname, `chinese/chinese.py`);
  const chineseScriptAppDataPath = path.join(appDataDirectory, 'chinese.py')
  let JMDict = {db: null, tags: {}};
  let KanjiDic = {db: null};
  let ChineseDict = {db: null};
  let wanikanji = {};
  let waniradical = {};
  let tokenizerCommand = 'mecab'
  const waniKaniKanjiDirectory = path.join(__dirname, 'wanikani/kanji.json');
  const waniKaniRadicalDirectory = path.join(__dirname, 'wanikani/radical.json');
  fs.readFile(waniKaniKanjiDirectory, 'utf8', (err, data) => {
    if (err) {
      console.error('An error occurred:', err);
      return;
    }
    wanikanji = JSON.parse(data);
  });
  fs.readFile(waniKaniRadicalDirectory, 'utf8', (err, data) => {
    if (err) {
      console.error('An error occurred:', err);
      return;
    }
    waniradical = JSON.parse(data);
  });
  const jmdictDBDirectory = path.join(appDataDirectory, `jmdict-db`);
  const kanjidicDBDirectory = path.join(appDataDirectory, `kanjidic-db`);
  const cantoDBDirectory = path.join(appDataDirectory, `cantodic-db`);
  const chineseDBDirectory = path.join(appDataDirectory, `cccedict-db`);
  const setUpJMDict = async (filename) => {
    try {
      if (JMDict.db) {
        JMDict.db.close()
      }
      const jmSetup = await setupJmdict(jmdictDBDirectory, filename);
      const jmTags = await getTags(jmSetup.db);
      JMDict = {
        db: jmSetup.db,
        tags: jmTags
      }
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  const setUpChineseDict = async (dbDir, filename) => {
    try {
      if (ChineseDict.db) {
        ChineseDict.db.close()
      }
      const chineseSetup = await setupChinese(dbDir, filename);
      ChineseDict = {
        db: chineseSetup.db,
      }
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  const setUpKanjiDic = async (filename) => {
    try {
      if (KanjiDic.db) {
        KanjiDic.db.close()
      }
      const jmSetup = await setupKanjidic(kanjidicDBDirectory, filename);
      KanjiDic = {
        db: jmSetup.db
      }
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  const removeJMDictCache = () => {
    if (JMDict.db) {
      JMDict.db.close()
    }
    try {
      fs.rmSync(jmdictDBDirectory, {
        recursive: true,
        force: true
      })
    } catch (e) {
      console.error(e)
    }
  }

  const removeKanjiDicCache = () => {
    if (KanjiDic.db) {
      KanjiDic.db.close()
    }
    try {
      fs.rmSync(kanjidicDBDirectory, {
        recursive: true,
        force: true
      })
    } catch (e) {
      console.error(e)
    }
  }

  const removeChineseCache = () => {
    if (ChineseDict.db) {
      ChineseDict.db.close()
    }
    try {
      fs.rmSync(cantoDBDirectory, {
        recursive: true,
        force: true
      })
      fs.rmSync(chineseDBDirectory, {
        recursive: true,
        force: true
      })
    } catch (e) {
      console.error(e)
    }
  }

  const mainWindow = createWindow('main', {
    width: 1000,
    height: 600,
    icon: path.join(__dirname, 'images/logo.png')
  });
  ipcMain.handle('query', async (event, query, limit) => {
    let matches = []
    try {
      matches = matches.concat(await readingBeginning(JMDict.db, query, limit));
      matches = matches.concat(await kanjiBeginning(JMDict.db, query));
      // matches = matches.concat(await readingAnywhere(JMDict.db, query, limit));
      // matches = matches.concat(await kanjiAnywhere(JMDict.db, query));
      const ids = matches.map(o => o.id)
      matches = matches.filter(({id}, index) => !ids.includes(id, index + 1))

      // Swap the exact match to front
      matches = matches.sort((a, b) => {
            const commonA = (a.kanji.length ? a.kanji[0].common : 0);
            const commonB = (b.kanji.length ? b.kanji[0].common : 0);
            if (commonA !== commonB) return commonB - commonA;
            // Get smallest kanji length in a and b, compare it
            const smallestA = (a.kanji.length ? (a.kanji[0].text ?? ''.length) : 0);
            const smallestB = (b.kanji.length ? (b.kanji[0].text ?? ''.length) : 0);
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
        if (matches[i].kanji.map(val => val.text ?? '').includes(query)) {
          [matches[i], matches[0]] = [matches[0], matches[i]]
          break;
        }
      }
      return matches
    } catch (e) {
      console.error(e)
      return []
    }
  })


  ipcMain.handle('queryChinese', async (event, query, limit) => {
    let matches = []
    try {
      matches = matches.concat(await charBeginning(ChineseDict.db, query, limit));
      matches = matches.concat(await charAnywhere(ChineseDict.db, query, limit));
      const ids = matches.map(o => o.id)
      matches = matches.filter(({id}, index) => !ids.includes(id, index + 1))

      // Swap the exact match to front
      matches = matches.sort((a, b) => {
            const commonA = (a.content.length);
            const commonB = (b.content.length);
            if (commonA !== commonB) return commonA - commonB;

            const meaningA = (a.meaning.length);
            const meaningB = (b.meaning.length);
            if (meaningA !== meaningB) return meaningB - meaningA;
            return a.content < b.content ? -1 : 1;
          }
      )
      return matches
    } catch (e) {
      console.error(e)
      return []
    }
  })


  ipcMain.handle('queryKanji', async (event, query) => {
    return searchKanji(KanjiDic.db, query);
  })
  ipcMain.handle('queryHanzi', async (event, query) => {
    try {
      return (await hanzi(ChineseDict.db, query, 1))[0];
    } catch (e) {
      return {}
    }
    // return searchKanji(KanjiDic.db, query);
  })

  ipcMain.handle('exactQuery', async (event, query, limit) => {
    let matches = await kanjiBeginning(JMDict.db, query, limit);
    matches = matches.concat(await readingBeginning(JMDict.db, query, limit));
    return matches;
  })

  ipcMain.handle('tags', (event) => {
    return JMDict.tags;
  })
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

  ipcMain.handle('loadDefaultMode', async (event) => {
    tokenizerCommand = 'kuromoji';
    await setUpKanjiDic(path.join(__dirname, 'dict/kanjidic.json'))
    return await checkJMDict({
      jmdict: path.join(__dirname, 'dict/jmdict.json')
    });
  })

  ipcMain.handle('loadCantonese', async (event) => {
    tokenizerCommand = 'cantonese';
    return await checkChinese({
      dict: path.join(__dirname, 'cantonese/cantodict.json'),
      appDataPath: cantoneseScriptAppDataPath,
      scriptFilePath: cantoneseScriptFilePath,
      dbDir: cantoDBDirectory
    })
  })

  ipcMain.handle('loadChinese', async (event) => {
    tokenizerCommand = 'jieba';
    return await checkChinese({
      dict: path.join(__dirname, 'chinese/chinese.json'),
      appDataPath: chineseScriptAppDataPath,
      scriptFilePath: chineseScriptFilePath,
      dbDir: chineseDBDirectory
    })
  })


  ipcMain.handle('getWaniKanji', async (event, kanji) => {
    return (wanikanji[kanji]);
  })

  ipcMain.handle('readKanjiSVG', async (event, filename) => {
    const kanjiFilePath = path.join(__dirname, `kanji/${filename}`);
    try {
      return fs.readFileSync(kanjiFilePath).toString();
    } catch (e) {
      return ''
    }
  })

  ipcMain.handle('readHanziSVG', async (event, filename) => {
    const hanziFilePath = path.join(__dirname, `hanzi/${filename}`);
    try {
      return fs.readFileSync(hanziFilePath).toString();
    } catch (e) {
      console.error(e);
      return ''
    }
  })

  ipcMain.handle('removeDictCache', (event) => {
    removeKanjiDicCache();
    removeJMDictCache()
    removeChineseCache()
    return true;
  })

  const okSetup = {ok: 1, message: 'Setup is ready'};

  const checkDicdir = (config) => {
    if (!fs.existsSync(config.dicdir) || !fs.lstatSync(config.dicdir).isDirectory()) return {
      ok: 0,
      message: `dicdir '${config.dicdir}' doesn't exist`
    };
    const IMPORTANT_FILES = ["char.bin", "dicrc", "matrix.bin", "sys.dic", "unk.dic"]
    for (const file of IMPORTANT_FILES) {
      const currentFile = path.join(config.dicdir, file)
      if (!fs.existsSync(currentFile)) return {
        ok: 0,
        message: `file '${currentFile}' doesn't exist`
      };
      if (!fs.lstatSync(currentFile).isFile()) return {
        ok: 0,
        message: `'${currentFile}' is not a file`
      };
    }
    return okSetup
  }

  const loadJMDict = async (config) => {
    // Load DB Here
    const ret = await setUpJMDict(config.jmdict);
    if (ret) {
      return okSetup;
    } else {
      return {
        ok: 0,
        message: `Failed to load JMDict DB!`
      };
    }
  }

  const loadChineseDict = async (config) => {
    // Load DB Here
    const ret = await setUpChineseDict(config.dbDir, config.dict);
    if (ret) {
      return okSetup;
    } else {
      return {
        ok: 0,
        message: `Failed to load Canto DB!`
      };
    }
  }

  const checkJMDict = async (config) => {
    if (!fs.existsSync(config.jmdict) || !fs.lstatSync(config.jmdict).isFile()) return {
      ok: 0,
      message: `jmdict '${config.jmdict}' doesn't exist`
    };
    if (!(config.jmdict.endsWith('.json'))) return {
      ok: 0,
      message: `'${config.jmdict}' is not a JSON file`
    };

    return await loadJMDict(config);
  }

  let pyshell = null;
  const checkChinese = async (config) => {
    if (!fs.existsSync(config.dict) || !fs.lstatSync(config.dict).isFile()) return {
      ok: 0,
      message: `Chinese '${config.dict}' doesn't exist`
    };
    if (!(config.dict.endsWith('.json'))) return {
      ok: 0,
      message: `'${config.dict}' is not a JSON file`
    };
    const scriptContent = fs.readFileSync(config.scriptFilePath, 'utf-8').toString();
    fs.writeFileSync(config.appDataPath, scriptContent);
    let pyshellOptions = {
      pythonOptions: ['-X', 'utf8']
    }
    pyshell = new PythonShell(config.appDataPath, pyshellOptions);
    return await loadChineseDict(config);
  }

  const checkMecab = (config) => {
    if (!fs.existsSync(config.mecab) || !(fs.lstatSync(config.mecab).isFile() || fs.lstatSync(config.mecab).isSymbolicLink())) return {
      ok: 0,
      message: `mecab '${config.mecab}' doesn't exist`
    };

    if (!(path.basename(config.mecab) === 'mecab' || path.basename(config.mecab) === 'mecab.exe')) {
      return {
        ok: 0,
        message: `'${config.mecab} is not a mecab file`
      };
    }

    tokenizerCommand = config.mecab;

    return okSetup;
  }

  ipcMain.handle('getTokenizerMode', async () => {
    return tokenizerCommand;
  })
  ipcMain.handle('validateConfig', async (event, config) => {
    let jmdictRes;
    if (!config.cached) {
      jmdictRes = await checkJMDict(config);
    } else {
      jmdictRes = await loadJMDict('')
      if (jmdictRes.ok === 1) jmdictRes.message = 'JMDict cache loaded successfuly'
    }
    if (jmdictRes.ok !== 1) return jmdictRes;
    await setUpKanjiDic(path.join(__dirname, 'dict/kanjidic.json'));
    const mecabRes = checkMecab(config);
    if (mecabRes.ok !== 1) return mecabRes;
    return okSetup;
  })
  ipcMain.handle('appDataPath', () => {
    return appDataDirectory
  })
  let packageJsonPath = path.join(app.getAppPath(), 'package.json');
  let packageJson = JSON.parse(fs.readFileSync(packageJsonPath).toString());
  ipcMain.handle('getAppVersion', async () => {
    return packageJson.version;
  });
  let tokenizer = null;
  getTokenizer({dicPath: path.join(__dirname, 'dict/')}).then(loadedTokenizer => {
    tokenizer = loadedTokenizer;
  }).catch(e => {
    console.error(e)
  })

  ipcMain.handle('tokenizeUsingKuromoji', async (event, sentence) => {
    return tokenizer.tokenizeForSentence(sentence);
  });

  ipcMain.handle('tokenizeUsingPyCantonese', async (event, sentence) => {
    pyshell.send(sentence);
    return new Promise((resolve, reject) => {
      pyshell.once('message', function (message) {
        resolve(JSON.parse(message));
      });
    });
  });
  ipcMain.handle('tokenizeUsingJieba', async (event, sentence) => {
    pyshell.send(sentence);
    return new Promise((resolve, reject) => {
      pyshell.once('message', function (message) {
        resolve(JSON.parse(message));
      });
    });
  });
  ipcMain.handle('getWaniRadical', async (event, radicalSlug) => {
    return waniradical[radicalSlug];
  });
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
