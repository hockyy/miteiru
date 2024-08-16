import {ipcMain} from "electron";
import {getTags, kanjiBeginning, readingBeginning, setup as wrapperJM} from "jmdict-wrapper";
import {search, setup as wrapperKanji} from "kanjidic-wrapper";
import path from "path";
import {readJsonFile} from "../utils";
import fs from "node:fs";
import {getTokenizer} from "kuromojin";
import {getFurigana, processKuromojinToSeparations} from "shunou";

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

  static getJapaneseSettings = (appDataDirectory, replacements: any = {}) => {
    return {
      importWanikaniKanji: path.join(__dirname, 'wanikani/kanji.json'),
      importWanikaniRadical: path.join(__dirname, 'wanikani/radical.json'),
      importKanjiDict: path.join(__dirname, 'dict/kanjidic.json'),
      importDict: path.join(__dirname, 'dict/jmdict.json'),
      charDictPath: path.join(appDataDirectory, `kanjidic-db`),
      dictPath: path.join(appDataDirectory, `jmdict-db`),
      importBaseSVG: path.join(__dirname, 'kanji'),
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
    try {
      if (this.Dict.db) {
        this.Dict.db.close();
      }
      if (this.KanjiDict.db) {
        this.KanjiDict.db.close();
      }
      const jmSetup = await wrapperJM(this.dictPath, this.importDict);
      const jmTags = await getTags(jmSetup.db);
      this.Dict = {
        db: jmSetup.db,
        tags: jmTags
      }
      const charSetup = await wrapperKanji(this.charDictPath, this.importKanjiDict);
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

  /**
   * TODO: Refactor this koakowakowakowko males bgt anjing
   */
  static registerKuromoji() {
    let tokenizer = null;
    getTokenizer({dicPath: path.join(__dirname, 'dict/')}).then(loadedTokenizer => {
      tokenizer = loadedTokenizer;
    }).catch(e => {
      console.error(e)
    })

    ipcMain.handle('tokenizeUsingKuromoji', async (event, sentence) => {
      return tokenizer.tokenizeForSentence(sentence);
    });
  }

  static registerHandlers() {
    ipcMain.handle('queryJapanese', async (event, query, limit) => {
      let matches = []
      try {
        matches = matches.concat(await readingBeginning(Japanese.Dict.db, query, limit));
        matches = matches.concat(await kanjiBeginning(Japanese.Dict.db, query));
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
              const isVerbA = +(!this.Dict.tags[a.sense[0].partOfSpeech[0]].includes("verb"));
              const isVerbB = +(!this.Dict.tags[b.sense[0].partOfSpeech[0]].includes("verb"));
              if (isVerbA !== isVerbB) return isVerbA - isVerbB;
              const isNounA = +(!this.Dict.tags[a.sense[0].partOfSpeech[0]].includes("noun"));
              const isNounB = +(!this.Dict.tags[b.sense[0].partOfSpeech[0]].includes("noun"));
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


    ipcMain.handle('queryKanji', async (event, query) => {
      return search(this.KanjiDict.db, query);
    })


    ipcMain.handle('japaneseTags', (event) => {
      return this.Dict.tags;
    })


    ipcMain.handle('getWaniKanji', async (event, kanji) => {
      return (this.wanikanji[kanji]);
    })

    ipcMain.handle('getWaniRadical', async (event, radicalSlug) => {
      return (this.waniradical[radicalSlug]);
    });

    ipcMain.handle('readKanjiSVG', async (event, filename) => {
      const kanjiFilePath = path.join(this.importBaseSVG, `${filename}`);
      try {
        return fs.readFileSync(kanjiFilePath).toString();
      } catch (e) {
        return ''
      }
    })

    ipcMain.handle('shunou-getFurigana', async (event, sentence, mode) => {
      return getFurigana(sentence, mode);
    });

    ipcMain.handle('shunou-processKuromojinToSeparations', async (event, kuromojiEntries) => {
      return processKuromojinToSeparations(kuromojiEntries);
    });
  }

}

export default Japanese;