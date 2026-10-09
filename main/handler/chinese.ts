import {hanzi, setupChineseDictionary} from "../dictionary/chineseDictionaryDb";
import {chineseLearningGloss, glossAll, queryChineseDictionary} from "./languages/learningGlosses";
import {ipcMain} from "electron";
import path from "path";
import {pinyin} from "pinyin-pro";
import ToJyutping from "to-jyutping";
import {Jieba} from '@node-rs/jieba'
import {formatPinyinReading} from "./pinyinTones";
import {readStrokeSvg} from "../helpers/strokeSvg";
import {readAssetSync} from "../helpers/assetFiles";


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
  static jiebaDictPath: string;
  static jieba;

  static queryHanziChinese = async (query: string) => {
    try {
      return (await hanzi(this.Dict.db, query, 1))[0];
    } catch {
      return {}
    }
  }

  /** Closes the CC-CEDICT / CantoDict database so its cache folder can be deleted. */
  static async closeDictionary() {
    await this.Dict.db?.close();
    this.Dict = {db: null};
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

    const dictBuffer = readAssetSync(this.jiebaDictPath)
    this.jieba = Jieba.withDict(dictBuffer);
    try {
      await this.Dict.db?.close();
      const dictSetup = await setupChineseDictionary(this.dictPath, this.importDict);
      this.Dict = {
        db: dictSetup.db
      }
      return;
    } catch (e) {
      console.error(e);
      return e.message;
    }
  }

  static tokenizeUsingJieba(sentence: string, toneType: string) {
    const tokens = this.jieba.cut(sentence);

    return tokens.map(word => {
      const pinyinInfo = pinyin(word, {
        toneType: 'num',
        type: 'all'
      });

      return {
        origin: word,
        pinyin: pinyinInfo.map(info => formatPinyinReading(info.pinyin, toneType)).join(' '),
        separation: pinyinInfo.map(info => ({
          main: info.origin,
          pinyin: formatPinyinReading(info.pinyin, toneType)
        }))
      };
    });
  }


  static getJyutpingForSentence(sentence: string, toneType: string): Promise<JyutpingResult[]> {
    return Promise.resolve().then(() => {
      const segments = this.jieba.cut(sentence);
      const result: JyutpingResult[] = [];

      // Use only the Discord tone map as requested
      const dcToneMap = {
        '1': 'ˉ¹',
        '2': '⸍²',
        '3': '-₃',
        '4': '⸜₄',
        '5': '⸝₅',
        '6': 'ˍ₆'
      };

      // Function to replace tone numbers with symbols
      function replaceToneSymbol(syllable: string): string {
        if(!syllable || !syllable.length) return ''
        const tone = syllable.slice(-1); // Get the last character (the tone)
        if (dcToneMap[tone]) {
          return syllable.slice(0, -1) + dcToneMap[tone]; // Replace the tone
        }
        return syllable; // Return unchanged if no tone number
      }

      for (const segment of segments) {
        const jyutpingList = ToJyutping.getJyutpingList(segment);

        // num: contour marks (ˉ¹); symbol: numbered jyutping (sik6)
        const formatJyutping = (jp: string | null) => {
          if (!jp) return jp;
          return toneType === 'num' ? replaceToneSymbol(jp) : jp;
        };

        const formattedJyutping = jyutpingList.map(([, jp]) => formatJyutping(jp)).join(' ');

        const separation = jyutpingList.map(([char, jp]) => {
          const formattedJp = formatJyutping(jp);

          return {
            main: char,
            jyutping: formattedJp
          };
        });

        result.push({
          origin: segment,
          jyutping: formattedJyutping,
          separation: separation
        });
      }

      return result;
    });
  }

  static registerHandlers() {
    ipcMain.handle('queryChinese', async (event, query, limit) => {
      try {
        return await queryChineseDictionary(Chinese.Dict.db, query, limit);
      } catch (e) {
        console.error(e)
        return []
      }
    })

    // Short glosses for every word of a learning-mode subtitle chunk, in request order.
    ipcMain.handle('learningGlossesChinese', async (_event, requests) => {
      const db = Chinese.Dict.db;
      if (!db) return [];
      return glossAll(requests, (request) => chineseLearningGloss(db, request));
    })

    ipcMain.handle('queryHanzi', async (event, query) => {
      try {
        return this.queryHanziChinese(query);
      } catch {
        return {}
      }
      // return searchKanji(KanjiDic.db, query);
    })

    ipcMain.handle('readHanziSVG', async (event, filename) => readStrokeSvg(this.importBaseSVG, filename));
  }

}

export default Chinese;