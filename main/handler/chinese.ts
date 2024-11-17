import {charAnywhere, charBeginning, hanzi, setup as wrapperChinese} from "cc-chinese-wrapper";
import {ipcMain} from "electron";
import path from "path";
import fs from "node:fs";
import {pinyin} from "pinyin-pro";
import ToJyutping from "to-jyutping";
import {cut, loadDict} from '@node-rs/jieba'
import {videoConstants} from "../../renderer/utils/constants";


interface JyutpingResult {
  origin: string;
  jyutping: string;
  separation: { main: string; jyutping: string | null }[];
}

class Chinese {

  static Dict = {db: null};
  static dictPath: string;
  static importDict: string;
  static importBaseSVG: string;
  static jiebaDictPath: string

  static queryHanziChinese = async (query: string) => {
    try {
      return (await hanzi(this.Dict.db, query, 1))[0];
    } catch (e) {
      return {}
    }
  }

  static getMandarinSettings = (appDataDirectory: string, replacements: any = {}) => {
    return {
      jiebaDictPath: path.join(__dirname, 'chinese/zh.jieba.txt'),
      dictPath: path.join(appDataDirectory, `cccedict-db`),
      importDict: path.join(__dirname, 'chinese/chinese.json'),
      importBaseSVG: path.join(__dirname, 'hanzi'),
      ...replacements
    }
  }

  static getCantoneseSettings = (appDataDirectory: string, replacements: any = {}) => {
    return {
      jiebaDictPath: path.join(__dirname, 'cantonese/yue.jieba.txt'),
      dictPath: path.join(appDataDirectory, `cantodict-db`),
      importDict: path.join(__dirname, 'cantonese/cantodict.json'),
      importBaseSVG: path.join(__dirname, 'hanzi'),
      ...replacements
    }
  }

  // Static setup method to initialize properties
  static async setup(settings) {
    this.dictPath = settings.dictPath;
    this.jiebaDictPath = settings.jiebaDictPath;
    this.importDict = settings.importDict;
    this.importBaseSVG = settings.importBaseSVG

    // this.setupPy(settings)
    // Initialize nodejieba

    const dictBuffer = fs.readFileSync(this.jiebaDictPath)
    loadDict(dictBuffer);
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
  }

  static registerNodeJieba() {
    ipcMain.handle('tokenizeUsingJieba', async (event, sentence, toneType) => {
      // Use nodejieba for segmentation
      const tokens = cut(sentence);

      return tokens.map(word => {
        // Get all pinyin information at once
        const pinyinInfo = pinyin(word, {
          toneType: toneType,
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


  static getJyutpingForSentence(sentence: string, toneType: string): Promise<JyutpingResult[]> {
    return Promise.resolve().then(() => {
      const segments = cut(sentence);
      const result: JyutpingResult[] = [];

      for (const segment of segments) {
        const jyutpingList = ToJyutping.getJyutpingList(segment);
        const jyutping = jyutpingList.map(([, jp]) => jp).join(' ');
        const separation = jyutpingList.map(([char, jp]) => {
          if (toneType == 'symbol' && jp) {
            const currentTone: string = jp.at(jp.length - 1);
            if ('0' <= currentTone && currentTone <= '9') {
              jp = jp.substring(0, jp.length - 1) + videoConstants.cantoneseToneMap[currentTone] + currentTone;
            }
          }
          return ({
            main: char,
            jyutping: jp
          });
        });

        result.push({
          origin: segment,
          jyutping: jyutping,
          separation: separation
        });
      }

      return result;
    });
  }

  static registerCantoJieba() {
    ipcMain.handle('tokenizeUsingCantoneseJieba', async (event, sentence, toneType: string) => {
      return await this.getJyutpingForSentence(sentence, toneType);
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