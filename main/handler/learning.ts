import {app, ipcMain} from "electron";
import {Level} from 'level';
import path from 'path';
import {LearningStateType} from "../../renderer/components/types";
import {OrderedSet} from "js-sdsl";
import Chinese from "./chinese";

const enum SkillConstant {
  Writing,
  Conveyance,
  Translation,
}

const SKILL_NAMES = ['Writing', 'Conveyance', 'Translation'] as const;
type SkillName = typeof SKILL_NAMES[number];

function convertToSkillConstant(value: string | number): SkillConstant {
  if (typeof value === 'number') {
    if (value >= 0 && value < SKILL_NAMES.length) {
      return value;
    }
  } else if (typeof value === 'string') {
    const index = SKILL_NAMES.indexOf(value as SkillName);
    if (index !== -1) {
      return index;
    }
  }
  throw new Error(`Invalid skill type: ${value}`);
}

enum ExamModeConstant {
  Exam,
  Review,
}

function sm2Algorithm(skill: Skill, grade: number) {
  const now = Math.floor(Date.now());
  if (grade >= 3) {
    skill.level++;
    const interval = Math.pow(1.4, skill.level - 1); // Interval doubles each level
    skill.nextReviewTime = now + interval * 24 * 60 * 60 * 1000; // Next review time
  } else {
    skill.level = Math.max(skill.level - 1, 0);
    skill.nextReviewTime = now; // Review immediately
  }
  skill.lastUpdated = now;
  return skill;
}


function getPair(lang: string, skill: SkillConstant) {
  return lang + '-' + skill;
}

// Utility function to generate a random integer between a and b (inclusive)
function getRange(a: number, b: number): number {
  const min = Math.ceil(a);
  const max = Math.floor(b);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function epochToLocalDate(epochTimestamp: number): string {
  // Convert epoch to milliseconds
  const date = new Date(epochTimestamp);

  // Options for date formatting
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  };

  // Convert to local date string
  return date.toLocaleString('en-US', options);
}

// Utility function to get the current timestamp
const now = () => Math.floor(Date.now());

// Skill Class
class Skill {
  skillName: string;
  lastUpdated: number;
  level: number;
  nextReviewTime: number

  constructor(name: string) {
    this.skillName = name;
    this.lastUpdated = now();
    this.level = 0;
    this.nextReviewTime = now();
  }

  // Method to convert the instance to a JSON string
  toJSON() {
    return {
      skillName: this.skillName,
      lastUpdated: this.lastUpdated,
      level: this.level,
      nextReviewTime: this.nextReviewTime
    };
  }

  // Static method to create an instance from a JSON string
  static fromJSON(obj: {
    skillName: string;
    lastUpdated: number;
    level: number;
    nextReviewTime: number;
  }) {
    const skill = new Skill(obj.skillName);
    skill.lastUpdated = obj.lastUpdated;
    skill.level = obj.level;
    skill.nextReviewTime = obj.nextReviewTime;
    return skill;
  }
}

class ComparatorKey {
  nextReviewTime: number;
  character: string;

  constructor(char: string, nextReview: number) {
    this.nextReviewTime = nextReview;
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
    SKILL_NAMES.forEach((skillName, index) => {
      this.skills.set(index, new Skill(skillName));
    });
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
  generateKey: (arg0: SRSData, skillType: SkillConstant) => ComparatorKey;
  skillSpecific: SkillConstant

  constructor(keyGenerator: (arg0: SRSData, skill: SkillConstant) => ComparatorKey, skill: SkillConstant) {
    this.skillSpecific = skill;
    this.container = new OrderedSet<ComparatorKey>([], (a: ComparatorKey, b: ComparatorKey) => {
      if (a.nextReviewTime != b.nextReviewTime) return a.nextReviewTime - b.nextReviewTime;
      if (a.character != b.character) return a.character < b.character ? -1 : 1;
      return 0;
    }, true);

    this.generateKey = keyGenerator;
  }

  insert(a: SRSData) {
    this.container.insert(this.generateKey(a, this.skillSpecific));
  }

  erase(a: SRSData) {
    this.container.eraseElementByKey(this.generateKey(a, this.skillSpecific));
  }

  orderOfKey(srsData: SRSData) {
    const res = this.container.find(this.generateKey(srsData, this.skillSpecific));
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
    if (!this.srsData.has(lang)) {
      SKILL_NAMES.forEach((skillName, index) => {
        this.learningTrees.set(
            getPair(lang, index),
            new OrderedTree(this.classicKeyGen, index)
        );
      });
      this.srsData.set(lang, new Map());
    }
    if (!this.srsData.get(lang)!.size) {
      return SRSDatabase.loadSRS(lang);
    }
  }

  static async getAllSRSData(lang: string) {
    const prefix = `srs/${lang}/`;
    const queryOptions = {
      gte: prefix,
      lte: `${prefix}\uFFFF`
    };

    const srsData = new Map();

    for await (const [key, value] of this.db.iterator(queryOptions)) {
      const character = key.substring(prefix.length);
      const parsedValue = JSON.parse(value);
      srsData.set(character, parsedValue);
    }

    return srsData;
  }

  static async banish() {
    const keys: string[] = [];

    for await (const [key] of this.db.iterator({gt: 'srs/', lt: 'srs/\uffff'})) {
      keys.push(key);
    }

    for (const key of keys) {
      await this.db.del(key);
    }
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

  static async storeOrUpdateToDB(lang: string, ch: string, srsData: SRSData) {
    await this.db.put(`srs/${lang}/${ch}`, srsData.toJSON());
  }

  static async storeOrUpdate(lang: string, character: string, srsData?: SRSData) {
    if (!this.srsData.has(lang)) {
      console.warn(`ERROR: srsData ${lang} not initted`)
      return;
    }
    if(!(await Chinese.queryHanziChinese(character))) return;
    if (!srsData && this.srsData.get(lang).has(character)) {
      srsData = this.srsData.get(lang).get(character)
    }

    if (!srsData) srsData = new SRSData(character, lang);
    await this.storeOrUpdateToDB(lang, character, srsData);
    this.srsData.get(lang).set(character, srsData);
    SKILL_NAMES.forEach((skillName, index) => {
      this.learningTrees.get(getPair(lang, index)).insert(srsData);
    });
  }

  static classicKeyGen(srsData: SRSData, skillType: SkillConstant) {
    return new ComparatorKey(srsData.character, srsData.skills.get(skillType).nextReviewTime);
  }

  static async updateSkillLevel(lang: string, character: string, skillType: SkillConstant, grade: number) {
    const ptrToSRSData = this.srsData.get(lang).get(character);
    if (!ptrToSRSData) return;

    const skill = ptrToSRSData.skills.get(skillType);
    this.learningTrees.get(getPair(lang, skillType)).erase(ptrToSRSData);
    this.srsData.get(lang).delete(character);
    console.log(`Updated ${character} from ${epochToLocalDate(skill.nextReviewTime)}`)
    sm2Algorithm(skill, grade);
    // console.log(`Updated ${character} to ${epochToLocalDate(skill.nextReviewTime)}`)
    await this.storeOrUpdate(lang, character, ptrToSRSData);
  }

  static async getQuestion(lang: string, skillType: SkillConstant, optionNumber: number = 3) {
    // console.log("Querying ", lang, skillType, optionNumber)
    const learningTree = this.learningTrees.get(getPair(lang, skillType));
    const treeSize = learningTree.container.size();
    // console.log('tree Size', treeSize)
    if (treeSize < 1) return null; // Not enough characters to generate a question
    const nextCharacter = learningTree.findByOrder(0); // Get the closest character to be learned
    let mode = ExamModeConstant.Exam;
    if (nextCharacter.nextReviewTime > now()) mode = ExamModeConstant.Review;
    // Ensure optionNumber does not exceed the available distinct characters
    optionNumber = Math.min(optionNumber, treeSize - 1);
    let selectedIndices: number[] = []
    if (optionNumber > 100) {

      // Generate iota from [1, size - 1]
      const indices = Array.from({length: treeSize - 1}, (_, i) => i + 1);

      // Shuffle the indices
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }

      // Select the first optionNumber indices
      selectedIndices = indices.slice(0, optionNumber);
    } else {
      for (let i = 0; i < optionNumber; i++) {
        let currentPicked = getRange(1, treeSize - 1 - i);
        for (const pre of selectedIndices) {
          if (currentPicked >= pre) currentPicked++;
        }
        selectedIndices.push(currentPicked);
      }
    }
    // console.log(selectedIndices)
    // console.log(nextCharacter)
    // Get the corresponding characters
    const correct = await Chinese.queryHanziChinese(nextCharacter.character);
    // console.log(correct)
    let options = [correct];
    for (const index of selectedIndices) {
      const characterAtRandomIndex = learningTree.findByOrder(index);
      if (characterAtRandomIndex) options.push(await Chinese.queryHanziChinese(characterAtRandomIndex.character));
    }
    options = options.sort(() => 0.5 - Math.random());
    return {
      // TODO: Change this to other languages
      question: "",
      correct,
      options,
      mode
    };
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
      if(!lang) return;
      try {
        await SRSDatabase.setup(lang);
        const prefix = `${lang}/`; // Define the prefix for keys
        const learningState = {};

        // Define the range for the query
        const queryOptions = {
          gte: prefix, // Start of the range: include the prefix
          lte: `${prefix}\uFFFF`, // End of the range: highest value that still matches the prefix
        };

        const promises = []
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
            promises.push(SRSDatabase.storeOrUpdate(lang, ch));
          }
          learningState[strippedKey] = parsedValue;
        }
        await Promise.all(promises);
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
        const promises = []
        await this.db.put(`${lang}/${content}`, JSON.stringify(data));
        for (const ch of content) {
          promises.push(SRSDatabase.storeOrUpdate(lang, ch));
        }
        await Promise.all(promises);
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
        const promises = [];
        for (const [key, value] of Object.entries(contents)) {
          const goUpdate = async () => {
            await this.db.put(`${lang}/${key}`, JSON.stringify(value));
          }
          this.db.get(`${lang}/${key}`).then(async val => {
            const parsedVal = JSON.parse(val);
            if (parsedVal.updTime < value.updTime) await goUpdate();
          }).catch(async () => {
            await goUpdate();
          })
          for (const ch of key) {
            promises.push(SRSDatabase.storeOrUpdate(lang, ch));
          }
        }
        await Promise.all(promises);
        return true; // Indicate success
      } catch (error) {
        console.error('Error updating content:', error);
        return false; // Indicate failure
      }
    });

    ipcMain.handle('learn-getOneQuestion', async (_event, lang, skillType) => {
      try {
        const convertedSkillType = convertToSkillConstant(skillType);
        const question = await SRSDatabase.getQuestion(lang, convertedSkillType);
        return {...question, skillType: convertedSkillType as number};
      } catch (error) {
        console.error('Error getting one question:', error);
        return null;
      }
    });

    ipcMain.handle('learn-updateOneCharacter', async (_event, skillType, lang, character, grade) => {
      try {
        const convertedSkillType = convertToSkillConstant(skillType);
        await SRSDatabase.updateSkillLevel(lang, character, convertedSkillType, grade);
        return true;
      } catch (error) {
        console.error('Error updating one character:', error);
        return false;
      }
    });

    ipcMain.handle('getAllSRS', async (_event, lang) => {
      try {
        const srsData = await SRSDatabase.getAllSRSData(lang);

        // Convert Map to a plain object for serialization
        return Object.fromEntries(srsData);
      } catch (error) {
        console.error('Error in getAllSRS:', error);
        throw error; // This will be caught in the renderer process
      }
    });
    ipcMain.handle('banishSRS', async () => {
      try {
        await SRSDatabase.banish();
        return {success: true, message: 'All SRS entries have been banished.'};
      } catch (error) {
        console.error('Error banishing SRS entries:', error);
        return {success: false, error: error.message};
      }
    });
    ipcMain.handle('setSRS', async (_event, lang: string, character: string, srsData?: string) => {
      const realData = SRSData.fromJSON(srsData);
      try {
        await SRSDatabase.storeOrUpdate(lang, character, realData);
        return {
          success: true,
          message: `SRS data for ${character} in ${lang} has been stored or updated successfully.`
        };
      } catch (error) {
        console.error('Error in setSRS:', error);
        return {
          success: false,
          error: error.message
        };
      }
    });
  }
}

export default Learning;