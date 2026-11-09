import {ipcMain} from "../../renderer/platform/backend/shims/desktop";
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
import {lookupUserDictionaryEntry, userJapaneseDictionaryResult} from "../helpers/userDictionary";
import {hasExactJapaneseDefault} from '../helpers/japaneseDictionaryPriority';

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

  /**
   * Starts loading the Kuromoji dictionary at launch so the first analysis is fast: from
   * `dictionaryFolder` (an installed Japanese pack's, found by the registry), else the bundled one.
   * Without Japanese data there is nothing to preload until the user installs the Japanese pack.
   */
  static async preloadKuromoji(dictionaryFolder?: string | null) {
    const candidates = [dictionaryFolder, path.join(__dirname, 'language-assets/japanese/dict'), path.join(__dirname, 'dict')]
      .filter((folder): folder is string => Boolean(folder));
    const present = await Promise.all(candidates.map((folder) => fsPromises.access(folder).then(() => true, () => false)));
    const found = candidates[present.indexOf(true)];
    if (!found) return;
    this.kuromojiDictPath ??= found;
    await this.loadKuromojiTokenizer().catch(e => {
      console.error(e)
    })
  }

  static registerHandlers() {
    ipcMain.handle('queryJapanese', async (event, query, limit) => {
      try {
        const custom = await lookupUserDictionaryEntry("ja", query);
        const defaults = Japanese.Dict.db ? await searchJapanese(Japanese.Dict.db, query, limit) : [];
        if (!custom) return defaults;
        const exactDefault = defaults.some((entry) => [...entry.kanji, ...entry.kana].some((form) => form.text === query));
        return custom.source === 'manual' || !exactDefault ? [userJapaneseDictionaryResult(custom), ...defaults]
          : [...defaults, userJapaneseDictionaryResult(custom)];
      } catch (e) {
        console.error(e)
        return []
      }
    })


    // Short glosses for every word of a learning-mode subtitle chunk, in request order.
    ipcMain.handle('learningGlossesJapanese', async (_event, requests) => {
      const db = this.Dict.db;
      return glossAll(requests, async (request) => {
        const custom = await lookupUserDictionaryEntry('ja', request.target);
        if (!custom) return db ? japaneseLearningGloss(db, request) : '';
        if (custom?.source === 'manual') return custom.meaning;
        if (db && await hasExactJapaneseDefault(db, request.target)) return japaneseLearningGloss(db, request);
        return custom?.meaning ?? (db ? japaneseLearningGloss(db, request) : '');
      });
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
