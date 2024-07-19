import {charAnywhere, charBeginning, hanzi, setup as wrapperChinese} from "cc-chinese-wrapper";
import {ipcMain} from "electron";
import path from "path";
import fs from "fs";
import {PythonShell} from "python-shell";
import * as nodejieba from "nodejieba";
import {pinyin} from "pinyin-pro";

class Chinese {

  static Dict = {db: null};
  static scriptPath: string;
  static scriptOutPath: string;
  static dictPath: string;
  static importDict: string;
  static importBaseSVG: string;
  static pyshell
  static jiebaDictPath: string

  static queryHanziChinese = async (query) => {
    try {
      return (await hanzi(this.Dict.db, query, 1))[0];
    } catch (e) {
      return {}
    }
  }

  static getMandarinSettings = (appDataDirectory, replacements: any = {}) => {
    return {
      scriptPath: path.join(__dirname, `chinese/chinese.py`),
      jiebaDictPath: path.join(__dirname, 'chinese/zh.jieba.txt'),
      scriptOutPath: path.join(appDataDirectory, 'chinese.py'),
      dictPath: path.join(appDataDirectory, `cccedict-db`),
      importDict: path.join(__dirname, 'chinese/chinese.json'),
      importBaseSVG: path.join(__dirname, 'hanzi'),
      ...replacements
    }
  }

  static getCantoneseSettings = (appDataDirectory, replacements: any = {}) => {
    return {
      scriptPath: path.join(__dirname, `cantonese/cantonese.py`),
      jiebaDictPath: path.join(__dirname, 'cantonese/yue.jieba.txt'),
      scriptOutPath: path.join(appDataDirectory, 'cantonese.py'),
      dictPath: path.join(appDataDirectory, `cantodict-db`),
      importDict: path.join(__dirname, 'cantonese/cantodict.json'),
      importBaseSVG: path.join(__dirname, 'hanzi'),
      ...replacements
    }
  }

  static setupPy(settings) {
    this.scriptPath = settings.scriptPath;
    this.scriptOutPath = settings.scriptOutPath;
    try {

      const scriptContent = fs.readFileSync(this.scriptPath, 'utf-8').toString();
      fs.writeFileSync(this.scriptOutPath, scriptContent);
      const pyshellOptions = {
        pythonOptions: ['-X', 'utf8']
      }
      this.pyshell = new PythonShell(this.scriptOutPath, pyshellOptions);
    } catch (e) {

    }
  }

  // Static setup method to initialize properties
  static async setup(settings) {
    this.dictPath = settings.dictPath;
    this.jiebaDictPath = settings.jiebaDictPath;
    this.importDict = settings.importDict;
    this.importBaseSVG = settings.importBaseSVG

    this.setupPy(settings)
    console.log(this.jiebaDictPath)
    // Initialize nodejieba
    nodejieba.load({
      userDict: this.jiebaDictPath
    });
    try {
      if (this.Dict.db) {
        this.Dict.db.close();
      }
      const dictSetup = await wrapperChinese(this.dictPath, this.importDict);
      this.Dict = {
        db: dictSetup.db
      }
      return;
    } catch (e) {
      console.error(e);
      return e.message;
    }
  }

  static registerJieba() {
    // This method now calls registerNodeJieba for backwards compatibility
    this.registerNodeJieba();
    // this.registerPyJieba();
  }

  static registerNodeJieba() {
    ipcMain.handle('tokenizeUsingJieba', async (event, sentence) => {
      // Use nodejieba for segmentation
      const tokens = nodejieba.cut(sentence);

      return tokens.map(word => {
        // Get all pinyin information at once
        const pinyinInfo = pinyin(word, {
          toneType: 'num',
          type: 'all'
        });

        return {
          origin: word,
          pinyin: pinyinInfo.map(info => info.pinyin).join(' '),
          separation: pinyinInfo.map(info => ({
            main: info.origin,
            pinyin: info.pinyin
          }))
        };
      });
    });
  }

  static registerPyCantonese() {
    ipcMain.handle('tokenizeUsingPyCantonese', async (event, sentence) => {
      this.pyshell.send(sentence);
      return new Promise((resolve) => {
        this.pyshell.once('message', function (message) {
          resolve(JSON.parse(message));
        });
      });
    });
  }

  static registerHandlers() {
    ipcMain.handle('queryChinese', async (event, query, limit) => {
      let matches = []
      try {
        matches = matches.concat(await charBeginning(Chinese.Dict.db, query, limit));
        matches = matches.concat(await charAnywhere(Chinese.Dict.db, query, limit));
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

    ipcMain.handle('queryHanzi', async (event, query) => {
      try {
        return this.queryHanziChinese(query);
      } catch (e) {
        return {}
      }
      // return searchKanji(KanjiDic.db, query);
    })

    ipcMain.handle('readHanziSVG', async (event, filename) => {
      const hanziFilePath = path.join(this.importBaseSVG, `${filename}`);
      try {
        return fs.readFileSync(hanziFilePath).toString();
      } catch (e) {
        return ''
      }
    })
  }

}

export default Chinese;