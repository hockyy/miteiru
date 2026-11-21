import {hanzi, setupChineseDictionary} from "../dictionary/chineseDictionaryDb";
import {chineseLearningGloss, glossAll, queryChineseDictionary} from "./languages/learningGlosses";
import {ipcMain} from "../../renderer/platform/backend/shims/desktop";
import path from "path";
import {pinyin} from "pinyin-pro";
import {convertOpencc} from "#miteiru/opencc";
import {jyutpingBatch} from "../language/jyutping";
import {Jieba} from "../../renderer/platform/backend/shims/jieba";
import {formatJyutpingReading, formatPinyinReading} from "./pinyinTones";
import {readStrokeSvg} from "../helpers/strokeSvg";
import {enabledUserDictionaryEntries, lookupUserDictionaryEntry, userChineseDictionaryResult, userDictionaryToken, UserDictionaryEntry} from "../helpers/userDictionary";
import type {DictionaryDb} from "../dictionary/levelDictionary";


interface JyutpingResult {
  origin: string;
  jyutping: string;
  separation: { main: string; jyutping: string | null }[];
}

const NO_USER_WORDS: UserDictionaryEntry[] = [];
const userWordMaps = new WeakMap<UserDictionaryEntry[], Map<string, UserDictionaryEntry>>();

export type ChineseLanguageCode = "zh-CN" | "yue";

/**
 * One Chinese language's engine: its dictionary (CC-CEDICT for Mandarin, CantoDict for Cantonese),
 * its tokenizer and the learner's own words for it. Mandarin and Cantonese each have one, so both can
 * be loaded at once: the learner's language for the subtitles and another for the language tools.
 */
export class ChineseEngine {
  Dict: {db: DictionaryDb | null} = {db: null};
  dictPath: string;
  importDict: string;
  importBaseSVG: string;
  jiebaDictPath: string;
  jieba: Pick<Jieba, "cut" | "setUserWords">;
  userWords: UserDictionaryEntry[] | undefined;
  userWordsUpdating: Promise<void> = Promise.resolve();

  constructor(public languageCode: ChineseLanguageCode) {}

  queryHanziChinese = async (query: string) => {
    try {
      return (await hanzi(this.Dict.db, query, 1))[0];
    } catch {
      return {}
    }
  }

  /** Closes the dictionary so its cache folder can be deleted. */
  async closeDictionary() {
    await this.Dict.db?.close();
    this.Dict = {db: null};
  }

  async setup(settings) {
    this.dictPath = settings.dictPath;
    this.jiebaDictPath = settings.jiebaDictPath;
    this.importDict = settings.importDict;
    this.importBaseSVG = settings.importBaseSVG

    // App-dictionary headwords stay off. See docs/chinese-tokenizer-evaluation.md for their
    // effect on Mandarin and Cantonese boundaries and load time. Your dictionary still takes part.
    this.jieba = await Jieba.withDictFile(this.jiebaDictPath);
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

  /**
   * Mandarin words with their pinyin. The pinyin is read for the whole text at once, not word by
   * word, so a character's reading comes from its sentence: 了 in 我吃了饭 is le, which pinyin-pro reads
   * as liǎo when it sees 了 alone.
   */
  async tokenizeUsingJieba(sentence: string, toneType: string) {
    const entries = await this.updateUserWords();
    const tokens: string[] = await this.jieba.cut(sentence);
    const inContext = await sentencePinyin(sentence);
    let offset = 0;

    return tokens.map(word => {
      const characters = Array.from(word);
      const readings = characters.map((character, index) => {
        const read = inContext[offset + index];
        return read && read.origin === character ? read.pinyin : pinyin(character, {toneType: 'num', type: 'all'})[0]?.pinyin ?? '';
      });
      offset += characters.length;
      const custom = entries.get(word);
      if (custom) return userDictionaryToken(custom, toneType);

      return {
        origin: word,
        pinyin: readings.map(reading => formatPinyinReading(reading, toneType)).join(' '),
        separation: characters.map((character, index) => ({
          main: character,
          pinyin: formatPinyinReading(readings[index], toneType)
        }))
      };
    });
  }

  async updateUserWords() {
    const enabled = await enabledUserDictionaryEntries(this.languageCode);
    const entries = enabled.length ? enabled : NO_USER_WORDS;
    const work = this.userWordsUpdating.catch(() => undefined).then(async () => {
      if (this.userWords === entries) return;
      await this.jieba.setUserWords(entries.map(({surface, source}) => ({surface, source})));
      this.userWords = entries;
    });
    this.userWordsUpdating = work;
    await work;
    if (!userWordMaps.has(entries)) userWordMaps.set(entries, new Map(entries.map((entry) => [entry.surface, entry])));
    return userWordMaps.get(entries)!;
  }

  getJyutpingForSentence(sentence: string, toneType: string): Promise<JyutpingResult[]> {
    return Promise.resolve().then(async () => {
      const entries = await this.updateUserWords();
      const segments = await this.jieba.cut(sentence);
      const result: JyutpingResult[] = [];

      const readings = await jyutpingBatch(segments);
      for (const [index, segment] of segments.entries()) {
        const custom = entries.get(segment);
        if (custom) {
          result.push(userDictionaryToken(custom, toneType) as unknown as JyutpingResult);
          continue;
        }
        const jyutpingList = readings[index];
        const formattedJyutping = jyutpingList.map(([, jp]) => formatJyutpingReading(jp, toneType)).join(' ');
        const separation = jyutpingList.map(([char, jp]) => ({
          main: char,
          jyutping: formatJyutpingReading(jp, toneType)
        }));

        result.push({
          origin: segment,
          jyutping: formattedJyutping,
          separation: separation
        });
      }

      return result;
    });
  }
}

/**
 * pinyin-pro's reading of every character of `text`, read together so polyphones take their context.
 * pinyin-pro knows its context words in simplified characters (們 alone is mén, 我们 is wǒ men), so a
 * traditional line is read through its simplified copy when that copy has the same characters count;
 * every item keeps the line's own character as its origin.
 */
export const sentencePinyin = async (text: string): Promise<Array<{origin: string; pinyin: string}>> => {
  if (!text) return [];
  const characters = Array.from(text);
  const [simplified] = await convertOpencc('t2s', [text]);
  const source = simplified !== text && Array.from(simplified).length === characters.length ? simplified : text;
  const read = pinyin(source, {toneType: 'num', type: 'all'}) as Array<{origin: string; pinyin: string}>;
  // One item per character is what the word offsets need; anything else falls back to word by word.
  if (read.length !== characters.length) return [];
  return source === text ? read : read.map((item, index) => ({origin: characters[index], pinyin: item.pinyin}));
};

export const mandarinEngine = new ChineseEngine("zh-CN");
export const cantoneseEngine = new ChineseEngine("yue");

/** The engine for a stored language code (zh-CN or yue). */
export const chineseEngine = (languageCode: string): ChineseEngine => (languageCode === "yue" ? cantoneseEngine : mandarinEngine);

/**
 * The Chinese the learner loaded last from Home, as one static class for the word popup and the code
 * written before Mandarin and Cantonese had an engine each. `languageCode` chooses which engine the
 * other members reach.
 */
class Chinese {

  static active: ChineseEngine = mandarinEngine;

  static get Dict() { return this.active.Dict; }
  static set Dict(value) { this.active.Dict = value; }
  static get languageCode(): ChineseLanguageCode { return this.active.languageCode; }
  static set languageCode(code: ChineseLanguageCode) { this.active = chineseEngine(code); }
  static get jieba() { return this.active.jieba; }
  static set jieba(value) { this.active.jieba = value; }
  static get userWords() { return this.active.userWords; }
  static set userWords(value) { this.active.userWords = value; }
  static get importBaseSVG() { return this.active.importBaseSVG; }

  static queryHanziChinese = (query: string) => Chinese.active.queryHanziChinese(query);

  /** Closes both dictionaries so their cache folders can be deleted. */
  static async closeDictionary() {
    await Promise.all([mandarinEngine.closeDictionary(), cantoneseEngine.closeDictionary()]);
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

  /** Sets up the settings' language (`languageCode`) and makes it the one the word popup uses. */
  static async setup(settings) {
    this.active = chineseEngine(settings.languageCode ?? "zh-CN");
    return this.active.setup(settings);
  }

  static tokenizeUsingJieba(sentence: string, toneType: string) {
    return this.active.tokenizeUsingJieba(sentence, toneType);
  }

  static updateUserWords() {
    return this.active.updateUserWords();
  }

  static getJyutpingForSentence(sentence: string, toneType: string) {
    return this.active.getJyutpingForSentence(sentence, toneType);
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
      const languageCode = this.languageCode;
      return glossAll(requests, async (request) => (await lookupUserDictionaryEntry(languageCode, request.target))?.meaning
        ?? (db ? chineseLearningGloss(db, request, languageCode) : ""));
    })

    ipcMain.handle('queryHanzi', async (event, query) => {
      try {
        return this.queryHanziChinese(query);
      } catch {
        return {}
      }
    })

    ipcMain.handle('readHanziSVG', async (event, filename) => readStrokeSvg(this.importBaseSVG, filename));
  }

}

export default Chinese;
