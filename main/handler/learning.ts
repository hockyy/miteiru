import {app, ipcMain} from "electron";
import {Level} from 'level';
import path from 'path';


class Learning {
  static dbPath;
  static db;

  static setup() {
// Define the path to the database
    this.dbPath = path.join(app.getPath('userData'), 'learningStateDB');
    this.db = new Level(this.dbPath);

  }

  static registerHandler() {

    // Handler to load the learning state
    ipcMain.handle('loadLearningState', async () => {
      try {
        const learningState = {};
        // Stream through all values in the database
        for await (const [key, value] of this.db.iterator()) {
          learningState[key] = parseInt(value, 10);
        }
        return learningState;
      } catch (error) {
        console.error('Error loading learning state:', error);
        return {};
      }
    });

    // Handler to update a specific content's learning state
    ipcMain.handle('updateContent', async (event, content, level) => {
      try {
        // Ensure level is within the expected range [0, 1, 2]
        const validLevel = Math.max(0, Math.min(parseInt(level, 10), 2));
        await this.db.put(content, validLevel.toString());
        return true; // Indicate success
      } catch (error) {
        console.error('Error updating content:', error);
        return false; // Indicate failure
      }
    });
  }
}

export default Learning;