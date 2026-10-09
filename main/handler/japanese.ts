import {ipcMain} from "electron";
import {getJmdictTags, kanjiBeginning, readingBeginning, setupJmdict} from "../dictionary/jmdictDb";
import {searchKanji, setupKanjidic} from "../dictionary/kanjidicDb";
import path from "path";
import {readJsonFile} from "../utils";
import fs from "node:fs";
import kuromoji, {type Tokenizer} from "kuromoji";
import {getFurigana, processKuromojinToSeparations, KuromojinWord} from "./languages/japaneseAnalysis";
import {buildInflectionTable, type InflectionTableRequest} from "./languages/inflectionTable";
import {readStrokeSvg} from "../helpers/strokeSvg";
import {glossAll, japaneseLearningGloss, rankJapaneseMatches} from "./languages/learningGlosses";

const buildKuromojiTokenizer = (dicPath: string) => new Promise<Tokenizer>((resolve, reject) => {
  kuromoji.builder({dicPath}).build((error, tokenizer) => (error ? reject(error) : resolve(tokenizer)));
});

class Japanese {

  static Dict = {
    db: null,
    tags: {}
  };
  static KanjiDict = {db: null};

  static wanikanji;
  static waniradical;


  static dictPath: string;
  static charDictPath: string;
  static importWanikaniKanji: string;
  static importWanikaniRadical: string;
  static importKanjiDict: string;
  static importDict: string;
  static importBaseSVG: string;
  static kuromojiDictPath: string;
  static kuromojiTokenizer: Tokenizer | null = null;
  static kuromojiTokenizerPromise: Promise<Tokenizer> | null = null;

  static getJapaneseSettings = (appDataDirectory, replacements: any = {}) => {
    return {
      importWanikaniKanji: path.join(__dirname, 'wanikani/kanji.json'),
      importWanikaniRadical: path.join(__dirname, 'wanikani/radical.json'),
      importKanjiDict: path.join(__dirname, 'dict/kanjidic.json'),
      importDict: path.join(__dirname, 'dict/jmdict.json'),
      charDictPath: path.join(appDataDirectory, `kanjidic-db`),
      dictPath: path.join(appDataDirectory, `jmdict-db`),
      importBaseSVG: path.join(__dirname, 'kanji'),
      kuromojiDictPath: path.join(__dirname, 'dict'),
      ...replacements
    };
  }

  static async setup(settings) {
    this.charDictPath = settings.charDictPath;
    this.dictPath = settings.dictPath;
    this.importWanikaniKanji = settings.importWanikaniKanji;
    this.importWanikaniRadical = settings.importWanikaniRadical;
    this.importDict = settings.importDict;
    this.importKanjiDict = settings.importKanjiDict;
    this.importBaseSVG = settings.importBaseSVG;
    this.kuromojiDictPath = settings.kuromojiDictPath;
    try {
      // Reopening the same path below needs the old handle's LevelDB lock released first.
      await this.Dict.db?.close();
      await this.KanjiDict.db?.close();
      const jmSetup = await setupJmdict(this.dictPath, this.importDict);
      const jmTags = await getJmdictTags(jmSetup.db);
      this.Dict = {
        db: jmSetup.db,
        tags: jmTags
      }
      const charSetup = await setupKanjidic(this.charDictPath, this.importKanjiDict);
      this.KanjiDict = {
        db: charSetup.db
      }
      this.wanikanji = await readJsonFile(this.importWanikaniKanji);
      this.waniradical = await readJsonFile(this.importWanikaniRadical);
      return;
    } catch (e) {
      console.error(e);
      return e.message;
    }
  }

  /** Closes the JMdict and KANJIDIC databases so their cache folders can be deleted. */
  static async closeDictionaries() {
    await this.Dict.db?.close();
    await this.KanjiDict.db?.close();
    this.Dict = {db: null, tags: {}};
    this.KanjiDict = {db: null};
  }

  static async setupHanCharacterCore(settings) {
    this.importWanikaniKanji = settings.importWanikaniKanji;
    this.importWanikaniRadical = settings.importWanikaniRadical;
    this.importBaseSVG = settings.importBaseSVG;

    try {
      this.wanikanji = await readJsonFile(this.importWanikaniKanji);
      this.waniradical = await readJsonFile(this.importWanikaniRadical);
      return;
    } catch (e) {
      console.error(e);
      return e.message;
    }
  }

  static async loadKuromojiTokenizer() {
    const dictionaryPath = [
      this.kuromojiDictPath,
      path.join(__dirname, 'language-assets/japanese/dict'),
      path.join(__dirname, 'dict')
    ].filter(Boolean).find((candidate) => fs.existsSync(candidate)) ?? path.join(__dirname, 'dict');

    // A failed load is forgotten so the next call retries (kuromojin cached the rejection for good).
    this.kuromojiTokenizerPromise ??= buildKuromojiTokenizer(dictionaryPath).then((loadedTokenizer) => {
      this.kuromojiTokenizer = loadedTokenizer;
      return loadedTokenizer;
    }, (error) => {
      this.kuromojiTokenizerPromise = null;
      throw error;
    });

    return this.kuromojiTokenizerPromise;
  }

  static async tokenizeUsingKuromoji(sentence: string): Promise<KuromojinWord[]> {
    const tokenizer = this.kuromojiTokenizer ?? await this.loadKuromojiTokenizer();
    return tokenizer.tokenizeForSentence(sentence);
  }

  static processKuromojinToSeparations = processKuromojinToSeparations;

  static getFurigana = getFurigana;

  /** Starts loading the Kuromoji dictionary at launch so the first analysis is fast. */
  static preloadKuromoji() {
    this.loadKuromojiTokenizer().catch(e => {
      console.error(e)
    })
  }

  static registerHandlers() {
    ipcMain.handle('queryJapanese', async (event, query, limit) => {
      let matches = []
      try {
        matches = matches.concat(await readingBeginning(Japanese.Dict.db, query, limit));
        matches = matches.concat(await kanjiBeginning(Japanese.Dict.db, query));
        // matches = matches.concat(await readingAnywhere(JMDict.db, query, limit));
        // matches = matches.concat(await kanjiAnywhere(JMDict.db, query));
        return rankJapaneseMatches(matches, query, this.Dict.tags ?? {});
      } catch (e) {
        console.error(e)
        return []
      }
    })


    // Short glosses for every word of a learning-mode subtitle chunk, in request order.
    ipcMain.handle('learningGlossesJapanese', async (_event, requests) => {
      const db = this.Dict.db;
      if (!db) return [];
      return glossAll(requests, (request) => japaneseLearningGloss(db, this.Dict.tags ?? {}, request));
    })

    ipcMain.handle('queryKanji', async (event, query) => {
      if (!this.KanjiDict.db) return undefined;
      return searchKanji(this.KanjiDict.db, query);
    })


    ipcMain.handle('japaneseTags', () => {
      return this.Dict.tags;
    })

    ipcMain.handle('getInflectionTable', async (_event, request: InflectionTableRequest) => {
      try {
        return buildInflectionTable(request, this.Dict.tags ?? {});
      } catch (e) {
        console.error(e);
        return null;
      }
    });


    ipcMain.handle('getWaniKanji', async (event, kanji) => {
      return (this.wanikanji?.[kanji]);
    })

    ipcMain.handle('getWaniRadical', async (event, radicalSlug) => {
      return (this.waniradical?.[radicalSlug]);
    });

    ipcMain.handle('readKanjiSVG', async (event, filename) => readStrokeSvg(this.importBaseSVG, filename));
  }

}

export default Japanese;