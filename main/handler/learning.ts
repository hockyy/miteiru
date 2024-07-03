import {app, ipcMain} from "electron";
import {Level} from 'level';
import path from 'path';
import {LearningStateType} from "../../renderer/components/types";
import {OrderedSet} from "js-sdsl";

enum SkillConstant {
  Writing,
  Conveyance,
  Translation,
}


function getPair(lang: string, skill: SkillConstant) {
  return lang + '-' + skill;
}

// Utility function to get the current timestamp
const now = () => Math.floor(Date.now() / 1000);

// Skill Class
class Skill {
  skillName: string;
  lastUpdated: number;
  level: number;

  constructor(name: string) {
    this.skillName = name;
    this.lastUpdated = now();
    this.level = 0;
  }

  // Method to convert the instance to a JSON string
  toJSON() {
    return {
      skillName: this.skillName,
      lastUpdated: this.lastUpdated,
      level: this.level,
    };
  }

  // Static method to create an instance from a JSON string
  static fromJSON(obj: { skillName: string; lastUpdated: number; level: number; }) {
    const skill = new Skill(obj.skillName);
    skill.lastUpdated = obj.lastUpdated;
    skill.level = obj.level;
    return skill;
  }
}

class ComparatorKey {
  value: number;
  character: string;

  constructor(char: string, skill: Skill) {
    this.value = skill.lastUpdated;
    this.character = char;
  }
}

// SRSData Class
class SRSData {
  character: string;
  lastUpdated: number;
  lastCreated: number;
  lang: string;
  skills: Map<SkillConstant, Skill>;

  constructor(char: string, language: string) {
    this.character = char;
    this.lastUpdated = now();
    this.lastCreated = now();
    this.lang = language;
    this.skills = new Map();
    for (const key of Object.keys(SkillConstant)) {
      this.skills.set(SkillConstant[key], new Skill(key));
    }
  }

  // Method to convert the instance to a JSON string
  toJSON() {
    const obj = {
      character: this.character,
      lastUpdated: this.lastUpdated,
      lastCreated: this.lastCreated,
      lang: this.lang,
      skills: Array.from(this.skills.entries()).map(([key, value]) => [key, value.toJSON()]),
    };
    return JSON.stringify(obj);
  }

  // Static method to create an instance from a JSON string
  static fromJSON(jsonStr: string) {
    const obj = JSON.parse(jsonStr);
    const instance = new SRSData(obj.character, obj.lang);
    instance.lastUpdated = obj.lastUpdated;
    instance.lastCreated = obj.lastCreated;
    instance.lang = obj.lang;
    instance.skills = new Map(obj.skills.map(([key, value]) => [key, Skill.fromJSON(value)]));
    return instance;
  }
}

// OrderedTree Class
class OrderedTree {
  container: OrderedSet<ComparatorKey>;
  generateKey: (arg0: SRSData) => ComparatorKey;

  constructor(keyGenerator: (arg0: SRSData) => ComparatorKey) {

    this.container = new OrderedSet<ComparatorKey>([], (a: ComparatorKey, b: ComparatorKey) => {
      if (a.value != b.value) return a.value - b.value;
      return a.character < b.character ? -1 : 1;
    }, true);

    this.generateKey = keyGenerator;
  }

  insert(a: SRSData) {
    this.container.insert(this.generateKey(a));
  }

  erase(a: SRSData) {
    this.container.eraseElementByKey(this.generateKey(a));
  }

  orderOfKey(srsData: SRSData) {
    const res = this.container.find(this.generateKey(srsData));
    if (res.equals(this.container.end())) return -1;
    return res.index;
  }

  findByOrder(index: number) {
    if (index >= this.container.size()) return null;
    return this.container.getElementByPos(index);
  }
}

// SRSDatabase Class
class SRSDatabase {
  // Maps pair <lang, skillType> => Sets of next SRS
  static learningTrees: Map<string, OrderedTree> = new Map();
  // map <lang, map <char, data>>
  static srsData: Map<string, Map<string, SRSData>> = new Map();
  static db: Level;
  static async setup(lang: string) {
    if (this.srsData.get(lang)) return;
    for (const key of Object.keys(SkillConstant)) {
      this.learningTrees.set(
          getPair(lang, SkillConstant[key]),
          new OrderedTree(this.classicKeyGen)
      );
    }
    this.srsData.set(lang, new Map())
    return SRSDatabase.loadSRS(lang);
  }

  static async loadSRS(lang: string) {
    const prefix = `srs/${lang}/`;

    const queryOptions = {
      gte: prefix,
      lte: `${prefix}\uFFFF`
    };

    for await (const [key, value] of this.db.iterator(queryOptions)) {
      const strippedKey = key.substring(prefix.length);
      const parsedValue = SRSData.fromJSON(value);
      this.srsData.get(lang).set(strippedKey, parsedValue);
    }
  }

  static storeOrUpdate(lang: string, ch: string, srsData: SRSData) {
    this.db.put(`srs/${lang}/${ch}`, srsData.toJSON()).then(r => console.log(r));
  }

  static insertNew(lang: string, character: string) {
    if (!this.srsData.has(lang)) {
      console.warn(`ERROR: srsData ${lang} not initted`)
      return;
    }

    if (this.srsData.get(lang).has(character)) {
      return;
    }
    const newSrs = new SRSData(character, lang);
    this.storeOrUpdate(lang, character, newSrs);
    this.srsData.get(lang).set(character, newSrs);
  }

  static updateLearningTrees(lang: string, character: string, skillName: SkillConstant, newLevel: number) {
    const ptrToSRSData = this.srsData.get(lang).get(character);
    if (!ptrToSRSData) return;

    this.learningTrees.get(getPair(lang, skillName)).erase(ptrToSRSData);

    ptrToSRSData.skills.get(skillName).level = newLevel;
    ptrToSRSData.skills.get(skillName).lastUpdated = now();
    ptrToSRSData.lastUpdated = now();

    this.learningTrees.get(getPair(lang, skillName)).insert(ptrToSRSData);
    this.storeOrUpdate(lang, character, ptrToSRSData);
  }

  static classicKeyGen(srsData: SRSData) {
    // Example key generator based on lastUpdated
    return new ComparatorKey(srsData.character, srsData.skills.get(SkillConstant.Writing));
  }
}


class Learning {
  static dbPath: string;
  static db: Level;

  static setup() {
    // Define the path to the database
    this.dbPath = path.join(app.getPath('userData'), 'learningStateDB');
    this.db = new Level(this.dbPath);
    SRSDatabase.db = this.db;
  }

  static registerHandler() {
    ipcMain.handle('loadLearningState', async (_event, lang) => {
      try {
        await SRSDatabase.setup(lang);
        const prefix = `${lang}/`; // Define the prefix for keys
        const learningState = {};

        // Define the range for the query
        const queryOptions = {
          gte: prefix, // Start of the range: include the prefix
          lte: `${prefix}\uFFFF`, // End of the range: highest value that still matches the prefix
        };

        // Efficiently iterate over keys within the specified range
        for await (const [key, value] of this.db.iterator(queryOptions)) {
          const strippedKey = key.substring(prefix.length);
          let parsedValue: { level: any; updTime: any; };

          try {
            parsedValue = JSON.parse(value);
            if (typeof parsedValue.level !== 'number' || typeof parsedValue.updTime !== 'number') {
              throw new Error('Invalid format');
            }
          } catch (e) {
            // If parsing fails, assume it's an old format (number)
            parsedValue = {
              level: parseInt(value, 10),
              updTime: Date.now()
            };
            await this.db.put(key, JSON.stringify(parsedValue));
          }
          if (parsedValue.level) for (const ch of strippedKey) {
            SRSDatabase.insertNew(lang, ch);
          }
          learningState[strippedKey] = parsedValue;
        }

        return learningState;
      } catch (error) {
        console.error('Error loading learning state:', error);
        return {};
      }
    });


    // Handler to update a specific content's learning state
    ipcMain.handle('updateContent', async (_event, content, lang, data) => {
      if (!content) return true;
      try {
        await this.db.put(`${lang}/${content}`, JSON.stringify(data));
        return true; // Indicate success
      } catch (error) {
        console.error('Error updating content:', error);
        return false; // Indicate failure
      }
    });

    // Handler to update a batch of contents' learning states
    ipcMain.handle('updateContentBatch', async (_event, contents: LearningStateType, lang) => {
      if (!contents) return true;
      try {
        for (const [key, value] of Object.entries(contents)) {
          const goUpdate = async () => {
            await this.db.put(`${lang}/${key}`, JSON.stringify(value));
          }
          this.db.get(`${lang}/${key}`).then(async val => {
            const parsedVal = JSON.parse(val);
            if (parsedVal.level < value.level) await goUpdate();
          }).catch(async () => {
            await goUpdate();
          })
        }
        return true; // Indicate success
      } catch (error) {
        console.error('Error updating content:', error);
        return false; // Indicate failure
      }
    });

    ipcMain.handle('updateSRSContent', async (_event, char, lang, data) => {
      if (!char) return false;
      try {
        await this.db.put(`srs/${lang}/${char}`, JSON.stringify(data));
        return true;
      } catch (error) {
        console.error('Error updating SRS content:', error);
        return false;
      }
    });

    ipcMain.handle('getQuestion', async (_event, lang) => {
      try {
        const prefix = `srs/${lang}/`;
        const srsState = {};
        const queryOptions = {
          gte: prefix,
          lte: `${prefix}\uFFFF`,
        };

        for await (const [key, value] of this.db.iterator(queryOptions)) {
          const strippedKey = key.substring(prefix.length);
          srsState[strippedKey] = JSON.parse(value);
        }

        return srsState;
      } catch (error) {
        console.error('Error loading SRS state:', error);
        return {};
      }
    });
  }
}

export default Learning;