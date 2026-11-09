import {hanzi, setupChineseDictionary} from "../dictionary/chineseDictionaryDb";
import {chineseLearningGloss, glossAll, queryChineseDictionary} from "./languages/learningGlosses";
import {ipcMain} from "../../renderer/platform/backend/shims/desktop";
import path from "path";
import {pinyin} from "pinyin-pro";
import ToJyutping from "to-jyutping";
import {Jieba} from '@node-rs/jieba'
import {formatPinyinReading} from "./pinyinTones";
import {readStrokeSvg} from "../helpers/strokeSvg";
import {readAsset} from "../helpers/assetFiles";
import {enabledUserDictionaryEntries, lookupUserDictionaryEntry, userChineseDictionaryResult, userDictionaryToken, UserDictionaryEntry} from "../helpers/userDictionary";


interface JyutpingResult {
  origin: string;
  jyutping: string;
  separation: { main: string; jyutping: string | null }[];
}

const NO_USER_WORDS: UserDictionaryEntry[] = [];
const userWordMaps = new WeakMap<UserDictionaryEntry[], Map<string, UserDictionaryEntry>>();

class Chinese {

  static Dict = {db: null};
  static dictPath: string;
  static importDict: string;
  static importBaseSVG: string;
  static jiebaDictPath: string;
  static jieba;
  static languageCode = "zh-CN";
  static userWords: UserDictionaryEntry[] | undefined;
  static userWordsUpdating: Promise<void> = Promise.resolve();

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
      languageCode: "zh-CN",
      jiebaDictPath: path.join(__dirname, 'chinese/zh.jieba.txt'),
      dictPath: path.join(appDataDirectory, `cccedict-db`),
      importDict: path.join(__dirname, 'chinese/chinese.json'),
      importBaseSVG: path.join(__dirname, 'hanzi'),
      ...replacements
    }
  }

  static getCantoneseSettings = (appDataDirectory: string, replacements: any = {}) => {
    return {
      languageCode: "yue",
      jiebaDictPath: path.join(__dirname, 'cantonese/yue.jieba.txt'),
      dictPath: path.join(appDataDirectory, `cantodict-db`),
      importDict: path.join(__dirname, 'cantonese/cantodict.json'),
      importBaseSVG: path.join(__dirname, 'hanzi'),
      ...replacements
    }
  }

  // Static setup method to initialize properties
  static async setup(settings) {
    this.languageCode = settings.languageCode ?? "zh-CN";
    this.dictPath = settings.dictPath;
    this.jiebaDictPath = settings.jiebaDictPath;
    this.importDict = settings.importDict;
    this.importBaseSVG = settings.importBaseSVG

    // this.setupPy(settings)
    // Initialize nodejieba

    // The Tauri build's @node-rs/jieba shim loads the dictionary file by path (its Rust side reads it).
    const loadsByPath = Jieba as unknown as {withDictFile?: (dictPath: string, dictionaryPath?: string) => Promise<unknown>};
    this.jieba = loadsByPath.withDictFile
      ? await loadsByPath.withDictFile(this.jiebaDictPath, this.importDict)
      : Jieba.withDict(await readAsset(this.jiebaDictPath));
    this.userWords = undefined;
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

  static async tokenizeUsingJieba(sentence: string, toneType: string) {
    const entries = await this.updateUserWords();
    const tokens = await this.jieba.cut(sentence);

    return tokens.map(word => {
      const custom = entries.get(word);
      if (custom) return userDictionaryToken(custom, toneType);
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


  static async updateUserWords() {
    const enabled = await enabledUserDictionaryEntries(this.languageCode);
    const entries = enabled.length ? enabled : NO_USER_WORDS;
    const work = this.userWordsUpdating.catch(() => undefined).then(async () => {
      if (this.userWords === entries) return;
      await this.jieba.setUserWords?.(entries.map(({surface, source}) => ({surface, source})));
      this.userWords = entries;
    });
    this.userWordsUpdating = work;
    await work;
    if (!userWordMaps.has(entries)) userWordMaps.set(entries, new Map(entries.map((entry) => [entry.surface, entry])));
    return userWordMaps.get(entries)!;
  }

  static getJyutpingForSentence(sentence: string, toneType: string): Promise<JyutpingResult[]> {
    return Promise.resolve().then(async () => {
      const entries = await this.updateUserWords();
      const segments = await this.jieba.cut(sentence);
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
        const custom = entries.get(segment);
        if (custom) {
          result.push(userDictionaryToken(custom, toneType) as unknown as JyutpingResult);
          continue;
        }
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
        const custom = await lookupUserDictionaryEntry(this.languageCode, query);
        const defaults = Chinese.Dict.db ? await queryChineseDictionary(Chinese.Dict.db, query, limit) : [];
        return custom ? [userChineseDictionaryResult(custom), ...defaults] : defaults;
      } catch (e) {
        console.error(e)
        return []
      }
    })

    // Short glosses for every word of a learning-mode subtitle chunk, in request order.
    ipcMain.handle('learningGlossesChinese', async (_event, requests) => {
      const db = Chinese.Dict.db;
      return glossAll(requests, async (request) => (await lookupUserDictionaryEntry(this.languageCode, request.target))?.meaning
        ?? (db ? chineseLearningGloss(db, request) : ""));
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
