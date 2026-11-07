import {ipcMain} from "electron";
import {getJmdictTags, setupJmdict} from "../dictionary/jmdictDb";
import {searchKanji, setupKanjidic} from "../dictionary/kanjidicDb";
import path from "path";
import {readJsonFile} from "../utils";
import fsPromises from "node:fs/promises";
import kuromoji, {type Tokenizer} from "kuromoji";
import {processKuromojinToSeparations, KuromojinWord} from "./languages/japaneseAnalysis";
import {buildInflectionTable, type InflectionTableRequest} from "./languages/inflectionTable";
import {readStrokeSvg} from "../helpers/strokeSvg";
import {glossAll, japaneseLearningGloss, searchJapanese} from "./languages/learningGlosses";

const buildKuromojiTokenizer = (dicPath: string) => new Promise<Tokenizer>((resolve, reject) => {
  kuromoji.builder({dicPath}).build((error, tokenizer) => (error ? reject(error) : resolve(tokenizer)));
});

let warnedAboutWanikani = false;

/**
 * The WaniKani data (kanji and radical levels) is a Japanese-learning extra. A Mandarin or Cantonese
 * learner has only the hanzi pack, so a missing file means no data, said once, and not a failed load.
 */
const readWanikani = async (file: string) => {
  try {
    return await readJsonFile(file);
  } catch (error) {
    if (!/ENOENT/.test(`${(error as NodeJS.ErrnoException)?.code ?? ""} ${(error as Error)?.message ?? ""}`)) throw error;
    if (!warnedAboutWanikani) {
      warnedAboutWanikani = true;
      console.warn(`[japanese] no WaniKani data at ${file}; kanji and radical levels will be empty`);
    }
    return {};
  }
};

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
      this.wanikanji = await readWanikani(this.importWanikaniKanji);
      this.waniradical = await readWanikani(this.importWanikaniRadical);
      return;
    } catch (e) {
      console.error(e);
      return e.message;
    }
  }

  static async loadKuromojiTokenizer() {
    let dictionaryPath = path.join(__dirname, 'dict');
    for (const candidate of [this.kuromojiDictPath, path.join(__dirname, 'language-assets/japanese/dict'), dictionaryPath]) {
      if (candidate && await fsPromises.access(candidate).then(() => true, () => false)) {
        dictionaryPath = candidate;
        break;
      }
    }

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

  /** Starts loading the Kuromoji dictionary at launch so the first analysis is fast. */
  static async preloadKuromoji() {
    // A build without bundled languages has nothing to preload until the user installs the Japanese pack.
    const bundled = [path.join(__dirname, 'language-assets/japanese/dict'), path.join(__dirname, 'dict')];
    const present = await Promise.all(bundled.map((folder) => fsPromises.access(folder).then(() => true, () => false)));
    if (!present.some(Boolean)) return;
    await this.loadKuromojiTokenizer().catch(e => {
      console.error(e)
    })
  }

  static registerHandlers() {
    ipcMain.handle('queryJapanese', async (event, query, limit) => {
      try {
        return await searchJapanese(Japanese.Dict.db, query, limit);
      } catch (e) {
        console.error(e)
        return []
      }
    })


    // Short glosses for every word of a learning-mode subtitle chunk, in request order.
    ipcMain.handle('learningGlossesJapanese', async (_event, requests) => {
      const db = this.Dict.db;
      if (!db) return [];
      return glossAll(requests, (request) => japaneseLearningGloss(db, request));
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