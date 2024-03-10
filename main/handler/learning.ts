import {app, ipcMain} from "electron";
import {Level} from 'level';
import path from 'path';
import {Content} from "next/dist/compiled/@next/font/dist/google";


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
          // Remove the prefix from the key for the response
          learningState[key.substring(prefix.length)] = parseInt(value, 10);
        }

        return learningState;
      } catch (error) {
        console.error('Error loading learning state:', error);
        return {};
      }
    });


    // Handler to update a specific content's learning state
    ipcMain.handle('updateContent', async (event, content, level, lang) => {
      if (!content) return true;
      try {
        await this.db.put(`${lang}/${content}`, `${level}`);
        return true; // Indicate success
      } catch (error) {
        console.error('Error updating content:', error);
        return false; // Indicate failure
      }
    });

    ipcMain.handle('updateContentBatch', async (event, contents, lang) => {
      if (!contents) return true;
      try {
        for (const [key, value] of Object.entries(contents)) {
          const goUpdate = async () => {
            await this.db.put(`${lang}/${key}`, `${value}`);
          }
          this.db.get(`${lang}/${key}`).then(async val => {
            if (val < value) await goUpdate();
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