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

function sm2Algorithm(skill: Skill, grade: number) {
  const now = Math.floor(Date.now() / 1000);
  if (grade >= 3) {
    if (skill.level === 0) {
      skill.level = 1;
      skill.nextReviewTime = now + 24 * 60 * 60; // Review in 1 day
    } else {
      skill.level++;
      const interval = Math.pow(2, skill.level - 1); // Interval doubles each level
      skill.nextReviewTime = now + interval * 24 * 60 * 60; // Next review time
    }
  } else {
    skill.level = 0;
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

// Utility function to get the current timestamp
const now = () => Math.floor(Date.now() / 1000);

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
    console.log("Trying to delete ", this.generateKey(a, this.skillSpecific))
    const deleted = this.container.eraseElementByKey(this.generateKey(a, this.skillSpecific));
    console.log(deleted)
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
    console.log("here")
    if (!this.srsData.has(lang)) {
      for (const key of Object.keys(SkillConstant)) {
        this.learningTrees.set(
            getPair(lang, SkillConstant[key]),
            new OrderedTree(this.classicKeyGen, SkillConstant[key])
        );
      }
      this.srsData.set(lang, new Map())
    }
    console.log(this.srsData.get(lang).size)
    if (!this.srsData.get(lang).size) {
      console.log("0?")
      return SRSDatabase.loadSRS(lang);
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

  static storeOrUpdateToDB(lang: string, ch: string, srsData: SRSData) {
    this.db.put(`srs/${lang}/${ch}`, srsData.toJSON()).then(r => console.log(r));
  }

  static storeOrUpdate(lang: string, character: string, srsData?: SRSData) {
    if (!this.srsData.has(lang)) {
      console.warn(`ERROR: srsData ${lang} not initted`)
      return;
    }
    console.log(srsData, character)
    if (!srsData && this.srsData.get(lang).has(character)) {
      srsData = this.srsData.get(lang).get(character)
    }
    console.log("OK")

    if (!srsData) srsData = new SRSData(character, lang);
    this.storeOrUpdateToDB(lang, character, srsData);
    this.srsData.get(lang).set(character, srsData);
    for (const key of Object.keys(SkillConstant)) {
      this.learningTrees.get(getPair(lang, SkillConstant[key])).insert(srsData);
    }
  }

  static classicKeyGen(srsData: SRSData, skillType: SkillConstant) {
    return new ComparatorKey(srsData.character, srsData.skills.get(skillType).nextReviewTime);
  }

  static updateSkillLevel(lang: string, character: string, skillType: SkillConstant, grade: number) {
    const ptrToSRSData = this.srsData.get(lang).get(character);
    if (!ptrToSRSData) return;

    const skill = ptrToSRSData.skills.get(skillType);
    this.learningTrees.get(getPair(lang, skillType)).erase(ptrToSRSData);
    this.srsData.get(lang).delete(character);
    console.log(ptrToSRSData.toJSON())
    sm2Algorithm(skill, grade);
    console.log(ptrToSRSData.toJSON())

    this.storeOrUpdate(lang, character, ptrToSRSData);
  }

  static getQuestion(lang: string, skillType: SkillConstant, optionNumber: number = 3) {
    const learningTree = this.learningTrees.get(getPair(lang, skillType));
    const treeSize = learningTree.container.size();
    console.log(skillType, "tree", treeSize)
    if (treeSize < 1) return null; // Not enough characters to generate a question
    const nextCharacter = learningTree.findByOrder(0); // Get the closest character to be learned
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
    // Get the corresponding characters
    const options = [];
    for (const index of selectedIndices) {
      const characterAtRandomIndex = learningTree.findByOrder(index);
      if (characterAtRandomIndex) options.push(characterAtRandomIndex.character);
    }

    return {
      question: nextCharacter.character,
      options: options.sort(() => 0.5 - Math.random()), // Shuffle the options
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
            SRSDatabase.storeOrUpdate(lang, ch);
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

    ipcMain.handle('updateSkillLevel', async (_event, lang, character, skillType, grade) => {
      try {
        SRSDatabase.updateSkillLevel(lang, character, skillType, grade);
        return true;
      } catch (error) {
        console.error('Error updating skill level:', error);
        return false;
      }
    });

    ipcMain.handle('learn-getOneQuestion', async (_event, lang, skillType) => {
      try {
        return SRSDatabase.getQuestion(lang, skillType);
      } catch (error) {
        console.error('Error getting one question:', error);
        return null;
      }
    });

    ipcMain.handle('learn-updateOneCharacter', async (_event, skillType, lang, character, isCorrect) => {
      console.log(">>>>>>")
      try {
        console.log("Updated")
        const grade = isCorrect ? 5 : 2; // SM2 grading: 5 for correct, 2 for incorrect
        SRSDatabase.updateSkillLevel(lang, character, skillType, grade);
        return true;
      } catch (error) {
        console.error('Error updating one character:', error);
        return false;
      }
    });
  }
}

export default Learning;