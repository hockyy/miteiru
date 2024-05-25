import {app, ipcMain} from "electron";
import {Level} from 'level';
import path from 'path';
import {LearningStateType} from "../../renderer/components/types";


class Learning {
  static dbPath;
  static db;

  static setup() {
    // Define the path to the database
    this.dbPath = path.join(app.getPath('userData'), 'learningStateDB');
    this.db = new Level(this.dbPath);
  }

  static registerHandler() {
    ipcMain.handle('loadLearningState', async (event, lang) => {
      try {
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
          let parsedValue;

          try {
            parsedValue = JSON.parse(value);
          } catch (e) {
            // If parsing fails, assume it's an old format (number)
            parsedValue = {
              level: parseInt(value, 10),
              updTime: Date.now()
            };
            await this.db.put(key, JSON.stringify(parsedValue));
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
    ipcMain.handle('updateContent', async (event, content, level, lang, updTime) => {
      if (!content) return true;
      try {
        const data = {
          level: level,
          updTime: updTime
        };
        await this.db.put(`${lang}/${content}`, JSON.stringify(data));
        return true; // Indicate success
      } catch (error) {
        console.error('Error updating content:', error);
        return false; // Indicate failure
      }
    });

    // Handler to update a batch of contents' learning states
    ipcMain.handle('updateContentBatch', async (event, contents: LearningStateType, lang) => {
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
  }
}

export default Learning;