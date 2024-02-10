import {charAnywhere, charBeginning, hanzi, setup as wrapperChinese} from "cc-chinese-wrapper";
import {ipcMain} from "electron";
import path from "path";
import fs from "fs";
import config from "tailwindcss/defaultConfig";
import {PythonShell} from "python-shell";

class Chinese {

  static Dict = {db: null};
  static scriptPath: string;
  static scriptOutPath: string;
  static dictPath: string;
  static importDict: string;
  static importBaseSVG: string;
  static pyshell


  static getMandarinSettings = (appDataDirectory, replacements: any = {}) => {
    return {
      scriptPath: path.join(__dirname, `chinese/chinese.py`),
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
      scriptOutPath: path.join(appDataDirectory, 'cantonese.py'),
      dictPath: path.join(appDataDirectory, `cantodict-db`),
      importDict: path.join(__dirname, 'cantonese/cantonese.json'),
      importBaseSVG: path.join(__dirname, 'hanzi'),
      ...replacements
    }
  }

  // Static setup method to initialize properties
  static async setup(settings) {
    this.scriptPath = settings.scriptPath;
    this.scriptOutPath = settings.scriptOutPath;
    this.dictPath = settings.dictPath;
    this.importDict = settings.importDict;
    this.importBaseSVG = settings.importBaseSVG
    try {
      if (this.Dict.db) {
        this.Dict.db.close();
      }
      const dictSetup = await wrapperChinese(this.dictPath, this.importDict);
      this.Dict = {
        db: dictSetup.db
      }
      const scriptContent = fs.readFileSync(this.scriptPath, 'utf-8').toString();
      fs.writeFileSync(this.scriptOutPath, scriptContent);
      let pyshellOptions = {
        pythonOptions: ['-X', 'utf8']
      }
      this.pyshell = new PythonShell(config.appDataPath, pyshellOptions);
      return;
    } catch (e) {
      console.error(e);
      return e.message;
    }
  }

  static registerJieba() {
    ipcMain.handle('tokenizeUsingJieba', async (event, sentence) => {
      this.pyshell.send(sentence);
      return new Promise((resolve, reject) => {
        this.pyshell.once('message', function (message) {
          resolve(JSON.parse(message));
        });
      });
    });
  }

  static registerPyCantonese() {
    ipcMain.handle('tokenizeUsingPyCantonese', async (event, sentence) => {
      this.pyshell.send(sentence);
      return new Promise((resolve, reject) => {
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
        return (await hanzi(this.Dict.db, query, 1))[0];
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

  static removeCache = () => {

    if (this.Dict.db) {
      this.Dict.db.close()
    }
    try {
      fs.rmSync(this.dictPath, {
        recursive: true,
        force: true
      })
    } catch (e) {
      console.error(e)
    }

  }

}

export default Chinese;